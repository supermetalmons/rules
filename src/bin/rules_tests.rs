use mons_rust::replay_rules_transition;
use std::io::{self, BufRead, BufReader};
use std::process;

const EXPECTED_CASE_COUNT: usize = 699_994;
const PROGRESS_INTERVAL: usize = 100_000;

#[derive(Debug)]
struct RuleTestCase {
    fen_before: String,
    fen_after: String,
    input_fen: String,
    output_fen: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    if let Some(argument) = std::env::args_os().nth(1) {
        return Err(format!(
            "rules_tests accepts no arguments (unexpected {argument:?})"
        ));
    }

    let stdin = io::stdin();
    let reader = BufReader::new(stdin.lock());
    let mut previous_raw: Option<String> = None;
    let mut count = 0usize;

    for line in reader.lines() {
        let raw = line.map_err(|error| format!("failed to read fixture stream: {error}"))?;
        count += 1;

        if count > EXPECTED_CASE_COUNT {
            return Err(format!(
                "fixture count exceeds {EXPECTED_CASE_COUNT} at line {count}"
            ));
        }
        if raw.is_empty() {
            return Err(format!("fixture line {count} is empty"));
        }

        let id = fnv1a_hash(raw.as_bytes());
        if let Some(previous) = previous_raw.as_deref() {
            match raw.as_bytes().cmp(previous.as_bytes()) {
                std::cmp::Ordering::Less => {
                    return Err(format!(
                        "out-of-order transition at fixture line {count} (FNV-1a ID {id}):\nprevious: {previous}\ncurrent:  {raw}"
                    ));
                }
                std::cmp::Ordering::Equal => {
                    return Err(format!(
                        "duplicate transition at fixture line {count} (FNV-1a ID {id})"
                    ));
                }
                std::cmp::Ordering::Greater => {}
            }
        }

        let case = RuleTestCase::from_json(raw.as_str()).map_err(|error| {
            format!("invalid fixture JSON at line {count} (FNV-1a ID {id}): {error}")
        })?;
        if case.canonical_json() != raw {
            return Err(format!(
                "fixture line {count} (FNV-1a ID {id}) is not canonical minified JSON"
            ));
        }

        check_case(count, id, &case)?;
        previous_raw = Some(raw);

        if count.is_multiple_of(PROGRESS_INTERVAL) {
            eprintln!("progress: {count}/{EXPECTED_CASE_COUNT} canonical rules transitions passed");
        }
    }

    if count != EXPECTED_CASE_COUNT {
        return Err(format!(
            "fixture count mismatch: expected {EXPECTED_CASE_COUNT}, read {count}"
        ));
    }

    println!("ok: {EXPECTED_CASE_COUNT} canonical rules transitions passed");
    Ok(())
}

fn check_case(line: usize, id: u64, case: &RuleTestCase) -> Result<(), String> {
    let Some((actual_output_fen, actual_fen_after)) =
        replay_rules_transition(case.fen_before.as_str(), case.input_fen.as_str())
    else {
        return Err(format!(
            "fixture line {line} (FNV-1a ID {id}) has an invalid fenBefore:\nfenBefore: {}\ninputFen:  {}",
            case.fen_before, case.input_fen
        ));
    };

    if actual_output_fen != case.output_fen || actual_fen_after != case.fen_after {
        return Err(format!(
            "fixture line {line} (FNV-1a ID {id}) rules mismatch:\nfenBefore:         {}\ninputFen:          {}\nexpected output:   {}\nactual output:     {}\nexpected fenAfter: {}\nactual fenAfter:   {}",
            case.fen_before,
            case.input_fen,
            case.output_fen,
            actual_output_fen,
            case.fen_after,
            actual_fen_after,
        ));
    }

    Ok(())
}

impl RuleTestCase {
    fn from_json(raw: &str) -> Result<Self, String> {
        Ok(Self {
            fen_before: extract_json_string_field(raw, "fenBefore")?,
            fen_after: extract_json_string_field(raw, "fenAfter")?,
            input_fen: extract_json_string_field(raw, "inputFen")?,
            output_fen: extract_json_string_field(raw, "outputFen")?,
        })
    }

    fn canonical_json(&self) -> String {
        format!(
            "{{\"fenAfter\":\"{}\",\"fenBefore\":\"{}\",\"inputFen\":\"{}\",\"outputFen\":\"{}\"}}",
            escape_json_string(self.fen_after.as_str()),
            escape_json_string(self.fen_before.as_str()),
            escape_json_string(self.input_fen.as_str()),
            escape_json_string(self.output_fen.as_str()),
        )
    }
}

fn extract_json_string_field(raw: &str, field: &str) -> Result<String, String> {
    let marker = format!("\"{field}\"");
    let marker_index = raw
        .find(marker.as_str())
        .ok_or_else(|| format!("missing `{field}` field"))?;
    let mut rest = &raw[marker_index + marker.len()..];
    rest = rest.trim_start();
    if !rest.starts_with(':') {
        return Err(format!("missing ':' after `{field}`"));
    }
    rest = rest[1..].trim_start();
    if !rest.starts_with('"') {
        return Err(format!("`{field}` must be a JSON string"));
    }
    parse_json_string(&rest[1..]).map_err(|error| format!("`{field}` parse error: {error}"))
}

fn parse_json_string(data: &str) -> Result<String, String> {
    let mut output = String::new();
    let mut chars = data.chars();

    while let Some(character) = chars.next() {
        match character {
            '"' => return Ok(output),
            '\\' => match chars
                .next()
                .ok_or_else(|| "incomplete escape sequence".to_string())?
            {
                '"' => output.push('"'),
                '\\' => output.push('\\'),
                '/' => output.push('/'),
                'b' => output.push('\u{0008}'),
                'f' => output.push('\u{000C}'),
                'n' => output.push('\n'),
                'r' => output.push('\r'),
                't' => output.push('\t'),
                'u' => {
                    let codepoint_hex: String = chars.by_ref().take(4).collect();
                    if codepoint_hex.len() != 4 {
                        return Err("incomplete unicode escape".to_string());
                    }
                    let codepoint = u32::from_str_radix(codepoint_hex.as_str(), 16)
                        .map_err(|_| format!("invalid unicode escape `{codepoint_hex}`"))?;
                    output.push(
                        char::from_u32(codepoint)
                            .ok_or_else(|| "invalid unicode scalar".to_string())?,
                    );
                }
                value => return Err(format!("unsupported escape sequence `\\{value}`")),
            },
            value if value.is_control() => {
                return Err("unescaped control character in JSON string".to_string());
            }
            value => output.push(value),
        }
    }

    Err("unterminated JSON string".to_string())
}

fn escape_json_string(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for character in raw.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0c}' => escaped.push_str("\\f"),
            value if value.is_control() => {
                use std::fmt::Write as _;
                let _ = write!(&mut escaped, "\\u{:04X}", value as u32);
            }
            value => escaped.push(value),
        }
    }
    escaped
}

fn fnv1a_hash(bytes: &[u8]) -> u64 {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    hash
}
