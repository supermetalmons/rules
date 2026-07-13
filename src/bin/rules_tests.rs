use mons_rust::{FenRepresentable, Input, MonsGame};
use std::cmp::min;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process;

const PROGRESS_INTERVAL: usize = 500;
const MAX_FAILURE_DETAILS: usize = 50;
const FAIL_SEPARATOR: &str =
    "================================================================================";

#[derive(Debug)]
struct CliOptions {
    expected_count: usize,
    source_label: String,
    protected_paths: Vec<PathBuf>,
    limit: Option<usize>,
    log_path: Option<PathBuf>,
    verbose: bool,
}

#[derive(Debug)]
struct RuleTestCase {
    fen_before: String,
    fen_after: String,
    input_fen: String,
    output_fen: String,
}

#[derive(Debug)]
struct CaseResult {
    id: String,
    passed: bool,
    summary: String,
    details: Vec<String>,
}

impl CaseResult {
    fn pass(id: String) -> Self {
        Self {
            id,
            passed: true,
            summary: "ok".to_string(),
            details: vec![],
        }
    }

    fn fail(id: String, summary: String, details: Vec<String>) -> Self {
        Self {
            id,
            passed: false,
            summary,
            details,
        }
    }
}

fn main() {
    if let Err(err) = run() {
        if !err.ends_with("rules test(s) failed") {
            eprintln!("{err}");
        }
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let Some(options) = parse_cli()? else {
        return Ok(());
    };

    let total_to_run = options.limit.map_or(options.expected_count, |limit| {
        min(limit, options.expected_count)
    });
    if total_to_run == 0 {
        return Err("no rules test fixtures to run".to_string());
    }

    if let Some(log_path) = options.log_path.as_deref() {
        validate_log_path(log_path, options.protected_paths.as_slice())?;
    }
    let mut logger = Logger::new(options.log_path.as_deref())
        .map_err(|err| format!("log setup failed: {err}"))?;
    logger
        .line(format!(
            "🧪 Running {total_to_run} rules tests from {}",
            options.source_label
        ))
        .map_err(|err| format!("failed to write log: {err}"))?;

    let stdin = io::stdin();
    let reader = BufReader::new(stdin.lock());
    let mut seen_ids: HashMap<u64, String> = HashMap::with_capacity(options.expected_count);
    let mut seen_transitions: HashSet<String> = HashSet::with_capacity(options.expected_count);
    let mut stream_count = 0usize;
    let mut completed = 0usize;
    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut logged_failures = 0usize;
    let mut hidden_failures = 0usize;

    for line in reader.lines() {
        let raw = line.map_err(|err| format!("failed to read fixture stream: {err}"))?;
        stream_count += 1;
        if raw.is_empty() {
            return Err(format!("fixture line {stream_count} is empty"));
        }

        let id_value = fnv1a_hash(raw.as_bytes());
        let id = id_value.to_string();
        if !seen_transitions.insert(raw.clone()) {
            return Err(format!(
                "duplicate transition at fixture line {stream_count} (FNV-1a ID {id})"
            ));
        }
        if let Some(previous) = seen_ids.insert(id_value, raw.clone()) {
            return Err(format!(
                "FNV-1a collision at fixture line {stream_count} (ID {id}): {previous} != {raw}"
            ));
        }

        let case = RuleTestCase::from_json(raw.as_str()).map_err(|err| {
            format!("invalid fixture JSON at line {stream_count} (FNV-1a ID {id}): {err}")
        })?;
        if case.canonical_json() != raw {
            return Err(format!(
                "fixture line {stream_count} (FNV-1a ID {id}) is not canonical minified JSON"
            ));
        }

        if completed >= total_to_run {
            continue;
        }

        let case_result = run_case(id, case);
        completed += 1;
        if case_result.passed {
            passed += 1;
            if options.verbose {
                logger
                    .line(format!("✅ [PASS] {}", case_result.id))
                    .map_err(|err| format!("failed to write log: {err}"))?;
            }
        } else {
            failed += 1;
            if logged_failures < MAX_FAILURE_DETAILS {
                log_failure(&mut logger, &case_result)
                    .map_err(|err| format!("failed to write log: {err}"))?;
                logged_failures += 1;
            } else {
                hidden_failures += 1;
            }
        }

        if completed.is_multiple_of(PROGRESS_INTERVAL) || completed == total_to_run {
            logger
                .line(format!(
                    "📊 Progress: {completed}/{total_to_run} (pass: {passed}, fail: {failed})"
                ))
                .map_err(|err| format!("failed to write log: {err}"))?;
        }
    }

    if stream_count != options.expected_count {
        return Err(format!(
            "fixture count mismatch: manifest expects {}, stream contains {stream_count}",
            options.expected_count
        ));
    }
    if completed != total_to_run {
        return Err(format!(
            "fixture execution count mismatch: expected {total_to_run}, ran {completed}"
        ));
    }

    if hidden_failures > 0 {
        logger
            .line(format!(
                "📝 Suppressed failure details for {hidden_failures} additional case(s)."
            ))
            .map_err(|err| format!("failed to write log: {err}"))?;
    }

    let finish_emoji = if failed > 0 { "❌" } else { "✅" };
    logger
        .line(format!(
            "{finish_emoji} Finished. Total: {total_to_run}, Passed: {passed}, Failed: {failed}"
        ))
        .map_err(|err| format!("failed to write log: {err}"))?;
    logger
        .flush()
        .map_err(|err| format!("failed to flush log output: {err}"))?;

    if failed > 0 {
        return Err(format!("{failed} rules test(s) failed"));
    }

    Ok(())
}

fn parse_cli() -> Result<Option<CliOptions>, String> {
    let mut expected_count = None;
    let mut source_label = "stdin".to_string();
    let mut protected_paths = Vec::new();
    let mut limit = None;
    let mut log_path = None;
    let mut verbose = false;
    let mut reads_stdin = false;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--stdin" => reads_stdin = true,
            "--expected-count" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--expected-count requires a value".to_string())?;
                let parsed = value
                    .parse::<usize>()
                    .map_err(|err| format!("invalid --expected-count value `{value}`: {err}"))?;
                expected_count = Some(parsed);
            }
            "--source-label" => {
                source_label = args
                    .next()
                    .ok_or_else(|| "--source-label requires a value".to_string())?;
            }
            "--protect-path" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--protect-path requires a value".to_string())?;
                protected_paths.push(PathBuf::from(value));
            }
            "--limit" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--limit requires a value".to_string())?;
                let parsed = value
                    .parse::<usize>()
                    .map_err(|err| format!("invalid --limit value `{value}`: {err}"))?;
                limit = Some(parsed);
            }
            "--log" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--log requires a file path".to_string())?;
                log_path = Some(PathBuf::from(value));
            }
            "--verbose" => verbose = true,
            "--help" | "-h" => {
                print_help();
                return Ok(None);
            }
            _ => return Err(format!("unknown argument `{arg}`. Use --help for usage.")),
        }
    }

    if !reads_stdin {
        return Err(
            "--stdin is required; pipe the JSONL fixture stream to this runner".to_string(),
        );
    }
    let expected_count = expected_count.ok_or_else(|| {
        "--expected-count is required so the stream can be checked against its manifest".to_string()
    })?;
    if expected_count == 0 {
        return Err("--expected-count must be greater than zero".to_string());
    }
    if log_path.is_some() && protected_paths.is_empty() {
        return Err("--log requires at least one --protect-path".to_string());
    }

    Ok(Some(CliOptions {
        expected_count,
        source_label,
        protected_paths,
        limit,
        log_path,
        verbose,
    }))
}

fn print_help() {
    println!("Run the buffered rules regression JSONL stream against Mons game logic.");
    println!();
    println!("Usage:");
    println!("  gzip -dc <corpus.jsonl.gz> | cargo run --bin rules_tests -- \\");
    println!("    --stdin --expected-count <n> [options]");
    println!("  ./scripts/run-rules-tests.sh [options]");
    println!();
    println!("Options:");
    println!("  --stdin                 Read one minified JSON fixture per stdin line");
    println!("  --expected-count <n>    Require exactly n unique fixtures in the stream");
    println!("  --source-label <label>  Label used in progress output (default: stdin)");
    println!("  --protect-path <path>   Prevent --log from aliasing an input (repeatable)");
    println!("  --limit <n>             Execute only the first n fixtures; validate all lines");
    println!("  --log <path>            Also write output to a log file");
    println!("  --verbose               Print each passing FNV-1a fixture ID");
    println!("  --help, -h              Show this help message");
}

fn validate_log_path(log_path: &Path, protected_paths: &[PathBuf]) -> Result<(), String> {
    for protected_path in protected_paths {
        let aliases = paths_alias(log_path, protected_path.as_path()).map_err(|err| {
            format!(
                "cannot safely compare --log path `{}` with protected input `{}`: {err}",
                log_path.display(),
                protected_path.display()
            )
        })?;
        if aliases {
            return Err(format!(
                "refusing --log path `{}` because it aliases protected input `{}`",
                log_path.display(),
                protected_path.display()
            ));
        }
    }
    Ok(())
}

fn paths_alias(left: &Path, right: &Path) -> io::Result<bool> {
    if let (Ok(left_metadata), Ok(right_metadata)) = (fs::metadata(left), fs::metadata(right)) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if left_metadata.dev() == right_metadata.dev()
                && left_metadata.ino() == right_metadata.ino()
            {
                return Ok(true);
            }
        }
    }

    Ok(path_for_comparison(left)? == path_for_comparison(right)?)
}

fn path_for_comparison(path: &Path) -> io::Result<PathBuf> {
    if fs::symlink_metadata(path).is_ok() {
        return fs::canonicalize(path);
    }

    let file_name = path.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("path `{}` has no file name", path.display()),
        )
    })?;
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    Ok(fs::canonicalize(parent)?.join(file_name))
}

fn run_case(id: String, case: RuleTestCase) -> CaseResult {
    let snapshot = snapshot_url(case.fen_before.as_str());
    let mut game = match MonsGame::from_fen(case.fen_before.as_str(), false) {
        Some(game) => game,
        None => {
            return CaseResult::fail(
                id,
                "invalid fenBefore".to_string(),
                vec![
                    format!("snapshot: {snapshot}"),
                    format!("inputFen: {}", case.input_fen),
                ],
            );
        }
    };

    let output = game.process_input(Input::array_from_fen(case.input_fen.as_str()), false, false);
    let actual_output_fen = output.fen();
    let actual_fen_after = game.fen();
    if actual_output_fen != case.output_fen {
        let mut details = vec![
            format!("snapshot: {snapshot}"),
            format!("inputFen: {}", case.input_fen),
            format!("expected outputFen: {}", case.output_fen),
            format!("actual outputFen:   {}", actual_output_fen),
        ];
        if actual_fen_after != case.fen_after {
            details.push(format!("expected fenAfter:  {}", case.fen_after));
            details.push(format!("actual fenAfter:    {}", actual_fen_after));
        }
        return CaseResult::fail(id, "outputFen mismatch".to_string(), details);
    }

    if actual_fen_after != case.fen_after {
        return CaseResult::fail(
            id,
            "fenAfter mismatch".to_string(),
            vec![
                format!("snapshot: {snapshot}"),
                format!("inputFen: {}", case.input_fen),
                format!("expected outputFen: {}", case.output_fen),
                format!("actual outputFen:   {}", actual_output_fen),
                format!("expected fenAfter:  {}", case.fen_after),
                format!("actual fenAfter:    {}", actual_fen_after),
            ],
        );
    }

    CaseResult::pass(id)
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
    parse_json_string(&rest[1..]).map_err(|err| format!("`{field}` parse error: {err}"))
}

fn parse_json_string(data: &str) -> Result<String, String> {
    let mut output = String::new();
    let chars: Vec<char> = data.chars().collect();
    let mut index = 0usize;

    while index < chars.len() {
        let ch = chars[index];
        if ch == '"' {
            return Ok(output);
        }
        if ch != '\\' {
            output.push(ch);
            index += 1;
            continue;
        }

        index += 1;
        if index >= chars.len() {
            return Err("incomplete escape sequence".to_string());
        }
        match chars[index] {
            '"' => output.push('"'),
            '\\' => output.push('\\'),
            '/' => output.push('/'),
            'b' => output.push('\u{0008}'),
            'f' => output.push('\u{000C}'),
            'n' => output.push('\n'),
            'r' => output.push('\r'),
            't' => output.push('\t'),
            'u' => {
                if index + 4 >= chars.len() {
                    return Err("incomplete unicode escape".to_string());
                }
                let codepoint_hex: String = chars[index + 1..=index + 4].iter().collect();
                let codepoint = u32::from_str_radix(codepoint_hex.as_str(), 16)
                    .map_err(|_| format!("invalid unicode escape `{codepoint_hex}`"))?;
                let decoded = char::from_u32(codepoint)
                    .ok_or_else(|| "invalid unicode scalar".to_string())?;
                output.push(decoded);
                index += 4;
            }
            value => return Err(format!("unsupported escape sequence `\\{value}`")),
        }
        index += 1;
    }

    Err("unterminated JSON string".to_string())
}

fn escape_json_string(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
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
    let mut hash = 14695981039346656037u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}

fn snapshot_url(fen: &str) -> String {
    let mut encoded = String::with_capacity(fen.len() * 3);
    for byte in fen.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(hex_digit(byte >> 4));
            encoded.push(hex_digit(byte & 0x0f));
        }
    }
    format!("https://mons.link/snapshot/{encoded}/")
}

fn hex_digit(nibble: u8) -> char {
    match nibble {
        0..=9 => (b'0' + nibble) as char,
        _ => (b'A' + nibble - 10) as char,
    }
}

fn log_failure(logger: &mut Logger, case_result: &CaseResult) -> io::Result<()> {
    logger.line(FAIL_SEPARATOR.to_string())?;
    logger.line(format!(
        "❌ [FAIL] {}: {}",
        case_result.id, case_result.summary
    ))?;
    for detail in &case_result.details {
        logger.line(detail.clone())?;
    }
    logger.line(FAIL_SEPARATOR.to_string())?;
    Ok(())
}

struct Logger {
    file: Option<BufWriter<File>>,
}

impl Logger {
    fn new(path: Option<&Path>) -> io::Result<Self> {
        let file = match path {
            Some(path) => Some(BufWriter::new(File::create(path)?)),
            None => None,
        };
        Ok(Self { file })
    }

    fn line(&mut self, line: String) -> io::Result<()> {
        println!("{line}");
        if let Some(file) = self.file.as_mut() {
            writeln!(file, "{line}")?;
        }
        Ok(())
    }

    fn flush(&mut self) -> io::Result<()> {
        if let Some(file) = self.file.as_mut() {
            file.flush()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should follow the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "mons-rules-log-protection-{}-{nonce}",
                process::id()
            ));
            fs::create_dir(&path).expect("temporary test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            self.0.as_path()
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn log_path_protection_rejects_normalized_hardlink_and_symlink_aliases() {
        let directory = TestDirectory::new();
        let protected = directory.path().join("corpus.jsonl.gz");
        fs::write(&protected, b"approved corpus").expect("protected fixture should be written");

        let nested = directory.path().join("nested");
        fs::create_dir(&nested).expect("nested directory should be created");
        let normalized_alias = nested.join("..").join("corpus.jsonl.gz");
        assert!(validate_log_path(&normalized_alias, std::slice::from_ref(&protected)).is_err());

        let hardlink = directory.path().join("hardlink.log");
        fs::hard_link(&protected, &hardlink).expect("hard link should be created");
        assert!(validate_log_path(&hardlink, std::slice::from_ref(&protected)).is_err());

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let symlink_path = directory.path().join("symlink.log");
            symlink(&protected, &symlink_path).expect("symbolic link should be created");
            assert!(validate_log_path(&symlink_path, std::slice::from_ref(&protected)).is_err());
        }

        assert_eq!(
            fs::read(&protected).expect("protected fixture should remain readable"),
            b"approved corpus"
        );
        let safe_log = directory.path().join("safe.log");
        validate_log_path(&safe_log, &[protected]).expect("distinct log path should be accepted");
    }
}
