use tokio::process::Command;
use crate::state::SystemPortInfo;

pub async fn pick_folder() -> Result<String, String> {
    let output = Command::new("zenity")
        .arg("--file-selection").arg("--directory")
        .output().await.map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Canceled".to_string())
    }
}

pub async fn scan_ports(_local_sys: &mut sysinfo::System) -> Vec<SystemPortInfo> {
    let output = std::process::Command::new("ss").arg("-ltnp").output();
    let mut list = Vec::new();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let port = parts[3].split(':').last().unwrap_or("").to_string();
                
                let mut cpu_usage = 0.0;
                let mut memory_mb = 0.0;
                
                list.push(SystemPortInfo { command: "Unknown".to_string(), pid: "".to_string(), user: "".to_string(), port, exe_path: None, cwd: None, cpu_usage, memory_mb, min_memory_mb: memory_mb, max_memory_mb: memory_mb });
            }
        }
    }
    list
}

pub fn build_command(command: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-l").arg("-c").arg(command);
    cmd
}

pub fn pause_process(pid: u32) { let _ = std::process::Command::new("kill").arg("-STOP").arg(pid.to_string()).output(); }
pub fn resume_process(pid: u32) { let _ = std::process::Command::new("kill").arg("-CONT").arg(pid.to_string()).output(); }
pub fn kill_process(pid: u32) { 
    if let Ok(out) = std::process::Command::new("kill").arg("-15").arg(pid.to_string()).output() {
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).to_lowercase();
            if err.contains("permitted") || err.contains("denied") {
                let _ = std::process::Command::new("pkexec").arg("kill").arg("-15").arg(pid.to_string()).output();
            }
        }
    }
}

pub fn force_kill_process(pid: u32) { 
    if let Ok(out) = std::process::Command::new("kill").arg("-9").arg(pid.to_string()).output() {
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).to_lowercase();
            if err.contains("permitted") || err.contains("denied") {
                let _ = std::process::Command::new("pkexec").arg("kill").arg("-9").arg(pid.to_string()).output();
            }
        }
    }
}
