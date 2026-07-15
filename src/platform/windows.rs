use tokio::process::Command;
use crate::state::SystemPortInfo;

pub async fn pick_folder() -> Result<String, String> {
    let output = Command::new("powershell")
        .arg("-Command")
        .arg("(new-object -COM 'Shell.Application').BrowseForFolder(0, 'Select Folder', 0, 0).self.path")
        .output().await.map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Canceled".to_string())
    }
}

pub async fn scan_ports(_local_sys: &mut sysinfo::System) -> Vec<SystemPortInfo> {
    let output = std::process::Command::new("netstat").arg("-ano").output();
    let mut list = Vec::new();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            if line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    let addr = parts[1];
                    let pid = parts[4].to_string();
                    let port = addr.rfind(':').map_or(addr.to_string(), |idx| addr[idx + 1..].to_string());
                    
                    let mut cpu_usage = 0.0;
                    let mut memory_mb = 0.0;
                    let mut exe_path = None;
                    if let Ok(parsed_pid) = pid.parse::<sysinfo::Pid>() {
                        if let Some(process) = local_sys.process(parsed_pid) {
                            cpu_usage = process.cpu_usage();
                            memory_mb = process.memory() as f32 / 1024.0 / 1024.0;
                            exe_path = process.exe().map(|p| p.to_string_lossy().to_string());
                        }
                    }
                    
                    list.push(SystemPortInfo { command: "Unknown".to_string(), pid, user: "N/A".to_string(), port, exe_path, cwd: None, cpu_usage, memory_mb, min_memory_mb: memory_mb, max_memory_mb: memory_mb });
                }
            }
        }
    }
    list
}

pub fn build_command(command: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.arg("/C").arg(command);
    cmd
}

pub fn pause_process(_pid: u32) {}
pub fn resume_process(_pid: u32) {}
pub fn kill_process(pid: u32) { let _ = std::process::Command::new("taskkill").arg("/PID").arg(pid.to_string()).output(); }
