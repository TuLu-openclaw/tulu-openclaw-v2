path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

old = '''    for svc in &services {
        let name_lower = svc.label.to_lowercase();
        let is_online = svc.status == "running" || svc.status == "online";
        if name_lower.contains("gateway") {
            status["gateway_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("hermes") {
            status["hermes_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("openclaw") {
            status["openclaw_online"] = serde_json::Value::Bool(is_online);
        }
    }'''

new = '''    for svc in &services {
        let name_lower = svc.label.to_lowercase();
        let is_online = svc.running;
        if name_lower.contains("gateway") {
            status["gateway_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("hermes") {
            status["hermes_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("openclaw") {
            status["openclaw_online"] = serde_json::Value::Bool(is_online);
        }
    }'''

c = c.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done: fixed running field')
