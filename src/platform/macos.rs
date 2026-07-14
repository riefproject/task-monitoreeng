use tokio::process::Command;
use crate::state::SystemPortInfo;

pub async fn pick_folder() -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e").arg("set folderPath to choose folder")
        .arg("-e").arg("POSIX path of folderPath")
        .output().await.map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Canceled".to_string())
    }
}

pub async fn scan_ports(local_sys: &mut sysinfo::System) -> Vec<SystemPortInfo> {
    let output = std::process::Command::new("lsof")
        .arg("-iTCP").arg("-sTCP:LISTEN").arg("-P").arg("-n").arg("-l")
        .output();
    let mut list = Vec::new();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let command = parts[0].to_string();
                let pid = parts[1].to_string();
                let user = parts[2].to_string();
                let address_part = parts[8];
                let port = address_part.rfind(':').map_or(address_part.to_string(), |idx| address_part[idx + 1..].to_string());
                let mut exe_path = None;
                let mut cwd = None;
                let mut cpu_usage = 0.0;
                let mut memory_mb = 0.0;
                if let Ok(parsed_pid) = pid.parse::<sysinfo::Pid>() {
                    if let Some(process) = local_sys.process(parsed_pid) {
                        exe_path = process.exe().map(|p| p.to_string_lossy().to_string());
                        cwd = process.cwd().map(|c| c.to_string_lossy().to_string());
                        cpu_usage = process.cpu_usage();
                        memory_mb = process.memory() as f32 / 1024.0 / 1024.0;
                    }
                }
                list.push(SystemPortInfo { command, pid, user, port, exe_path, cwd, cpu_usage, memory_mb, min_memory_mb: memory_mb, max_memory_mb: memory_mb });
            }
        }
    }
    list
}

pub fn build_command(cmd: &str) -> Command {
    let mut c = Command::new("sh");
    c.arg("-c").arg(cmd);
    c
}

pub fn pause_process(pid: u32) { let _ = std::process::Command::new("kill").arg("-STOP").arg(pid.to_string()).output(); }
pub fn resume_process(pid: u32) { let _ = std::process::Command::new("kill").arg("-CONT").arg(pid.to_string()).output(); }
pub fn kill_process(pid: u32) { let _ = std::process::Command::new("kill").arg("-9").arg(pid.to_string()).output(); }
