use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouteGraph {
    pub nodes: Vec<RouteNode>,
    pub edges: Vec<RouteEdge>,
    pub diagnostics: Vec<RouteDiagnostic>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouteNode {
    pub id: String,
    pub kind: NodeKind,
    pub key: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Agent,
    Provider,
    Model,
    Channel,
    Account,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouteEdge {
    pub id: String,
    pub kind: EdgeKind,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EdgeKind {
    Provides,
    UsesModel,
    HasAccount,
    RoutesTo,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouteDiagnostic {
    pub code: DiagnosticCode,
    pub severity: DiagnosticSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binding_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub node_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticCode {
    MissingAgent,
    MissingChannel,
    MissingAccount,
    MissingProvider,
    MissingModel,
    InvalidBinding,
    DuplicateBinding,
    CompetingBinding,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone)]
struct ModelReference {
    value: String,
    role: &'static str,
    inherited: bool,
}

#[derive(Debug, Clone)]
struct BindingRecord {
    index: usize,
    agent_id: String,
    channel_id: String,
    account_id: Option<String>,
    normalized_match: Value,
    route_key: String,
}

/// Read one immutable openclaw.json snapshot. This deliberately does not use
/// the normal config loader because that loader may repair or write the file.
fn read_snapshot(path: &Path) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("读取 OpenClaw 配置失败: {error}"))?;
    let payload = bytes
        .strip_prefix(&[0xEF, 0xBB, 0xBF])
        .unwrap_or(bytes.as_slice());
    let text = std::str::from_utf8(payload)
        .map_err(|error| format!("OpenClaw 配置不是有效 UTF-8: {error}"))?;
    serde_json::from_str(text).map_err(|error| {
        format!(
            "OpenClaw 配置 JSON 解析失败: {error} (行: {}, 列: {})",
            error.line(),
            error.column()
        )
    })
}

#[tauri::command]
pub fn get_route_graph() -> Result<RouteGraph, String> {
    let path = super::openclaw_dir().join("openclaw.json");
    let snapshot = read_snapshot(&path)?;
    build_route_graph(&snapshot)
}

fn build_route_graph(snapshot: &Value) -> Result<RouteGraph, String> {
    if !snapshot.is_object() {
        return Err("OpenClaw 配置顶层必须是对象".to_string());
    }

    let mut graph = RouteGraph {
        nodes: Vec::new(),
        edges: Vec::new(),
        diagnostics: Vec::new(),
    };
    let mut agent_ids = BTreeSet::new();
    let mut provider_models: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut channel_accounts: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    build_provider_nodes(snapshot, &mut graph, &mut provider_models);
    build_channel_nodes(snapshot, &mut graph, &mut channel_accounts);
    build_agent_nodes(snapshot, &mut graph, &mut agent_ids, &provider_models);
    build_binding_edges(snapshot, &mut graph, &agent_ids, &channel_accounts);

    graph.nodes.sort_by(|left, right| left.id.cmp(&right.id));
    graph.edges.sort_by(|left, right| left.id.cmp(&right.id));
    graph.diagnostics.sort_by(|left, right| {
        left.binding_index
            .cmp(&right.binding_index)
            .then_with(|| diagnostic_code_key(left.code).cmp(diagnostic_code_key(right.code)))
            .then_with(|| left.message.cmp(&right.message))
    });
    Ok(graph)
}

fn build_provider_nodes(
    snapshot: &Value,
    graph: &mut RouteGraph,
    provider_models: &mut BTreeMap<String, BTreeSet<String>>,
) {
    let Some(providers) = snapshot
        .pointer("/models/providers")
        .and_then(Value::as_object)
    else {
        return;
    };

    let mut provider_keys: Vec<&String> = providers.keys().collect();
    provider_keys.sort();
    for provider_id in provider_keys {
        let provider = &providers[provider_id];
        let provider_node_id = node_id("provider", provider_id);
        graph.nodes.push(RouteNode {
            id: provider_node_id.clone(),
            kind: NodeKind::Provider,
            key: provider_id.clone(),
            label: provider
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(provider_id)
                .to_string(),
            parent_id: None,
            data: None,
        });

        let mut model_ids = BTreeSet::new();
        if let Some(models) = provider.get("models").and_then(Value::as_array) {
            for model in models {
                let Some(model_id) = model
                    .as_str()
                    .or_else(|| model.get("id").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                else {
                    continue;
                };
                if !model_ids.insert(model_id.to_string()) {
                    continue;
                }
                let full_model_id = format!("{provider_id}/{model_id}");
                let model_node_id = node_id("model", &full_model_id);
                graph.nodes.push(RouteNode {
                    id: model_node_id.clone(),
                    kind: NodeKind::Model,
                    key: full_model_id,
                    label: model
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(model_id)
                        .to_string(),
                    parent_id: Some(provider_node_id.clone()),
                    data: None,
                });
                graph.edges.push(RouteEdge {
                    id: edge_id("provides", &provider_node_id, &model_node_id, None),
                    kind: EdgeKind::Provides,
                    source: provider_node_id.clone(),
                    target: model_node_id,
                    data: None,
                });
            }
        }
        provider_models.insert(provider_id.clone(), model_ids);
    }
}

fn build_channel_nodes(
    snapshot: &Value,
    graph: &mut RouteGraph,
    channel_accounts: &mut BTreeMap<String, BTreeSet<String>>,
) {
    let Some(channels) = snapshot.get("channels").and_then(Value::as_object) else {
        return;
    };
    let mut channel_keys: Vec<&String> = channels.keys().collect();
    channel_keys.sort();

    for channel_id in channel_keys {
        let channel = &channels[channel_id];
        let channel_node_id = node_id("channel", channel_id);
        graph.nodes.push(RouteNode {
            id: channel_node_id.clone(),
            kind: NodeKind::Channel,
            key: channel_id.clone(),
            label: channel_id.clone(),
            parent_id: None,
            data: channel
                .get("enabled")
                .and_then(Value::as_bool)
                .map(|enabled| value_object([("enabled", Value::Bool(enabled))])),
        });

        let mut accounts = BTreeSet::new();
        if let Some(configured_accounts) = channel.get("accounts").and_then(Value::as_object) {
            accounts.extend(configured_accounts.keys().cloned());
        }
        // A channel without accounts is the legacy single-account shape.
        if accounts.is_empty() {
            accounts.insert("default".to_string());
        }

        for account_id in &accounts {
            let account_key = format!("{channel_id}/{account_id}");
            let account_node_id = node_id("account", &account_key);
            graph.nodes.push(RouteNode {
                id: account_node_id.clone(),
                kind: NodeKind::Account,
                key: account_id.clone(),
                label: account_id.clone(),
                parent_id: Some(channel_node_id.clone()),
                data: Some(value_object([
                    ("channelId", Value::String(channel_id.clone())),
                    ("legacy", Value::Bool(channel.get("accounts").is_none())),
                ])),
            });
            graph.edges.push(RouteEdge {
                id: edge_id("hasAccount", &channel_node_id, &account_node_id, None),
                kind: EdgeKind::HasAccount,
                source: channel_node_id.clone(),
                target: account_node_id,
                data: None,
            });
        }
        channel_accounts.insert(channel_id.clone(), accounts);
    }
}

fn build_agent_nodes(
    snapshot: &Value,
    graph: &mut RouteGraph,
    agent_ids: &mut BTreeSet<String>,
    provider_models: &BTreeMap<String, BTreeSet<String>>,
) {
    let default_model = snapshot.pointer("/agents/defaults/model");
    let mut agents = snapshot
        .pointer("/agents/list")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let has_main = agents
        .iter()
        .any(|agent| agent.get("id").and_then(Value::as_str).map(str::trim) == Some("main"));
    if !has_main {
        agents.insert(0, value_object([("id", Value::String("main".to_string()))]));
    }

    for agent in agents {
        let Some(agent_id) = agent
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if !agent_ids.insert(agent_id.to_string()) {
            continue;
        }
        let agent_node_id = node_id("agent", agent_id);
        graph.nodes.push(RouteNode {
            id: agent_node_id.clone(),
            kind: NodeKind::Agent,
            key: agent_id.to_string(),
            label: agent
                .pointer("/identity/name")
                .and_then(Value::as_str)
                .unwrap_or(agent_id)
                .to_string(),
            parent_id: None,
            data: Some(value_object([(
                "implicit",
                Value::Bool(agent_id == "main" && !has_main),
            )])),
        });

        let explicit_model = agent.get("model").filter(|model| !model.is_null());
        let selected_model = explicit_model.or(default_model);
        let inherited = explicit_model.is_none() && selected_model.is_some();
        for reference in model_references(selected_model, inherited) {
            connect_agent_model(graph, &agent_node_id, agent_id, &reference, provider_models);
        }
    }
}

fn model_references(model: Option<&Value>, inherited: bool) -> Vec<ModelReference> {
    let Some(model) = model else {
        return Vec::new();
    };
    if let Some(primary) = model
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return vec![ModelReference {
            value: primary.to_string(),
            role: "primary",
            inherited,
        }];
    }

    let Some(model) = model.as_object() else {
        return Vec::new();
    };
    let mut references = Vec::new();
    if let Some(primary) = model
        .get("primary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        references.push(ModelReference {
            value: primary.to_string(),
            role: "primary",
            inherited,
        });
    }
    if let Some(fallbacks) = model.get("fallbacks").and_then(Value::as_array) {
        for fallback in fallbacks {
            if let Some(value) = fallback
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                references.push(ModelReference {
                    value: value.to_string(),
                    role: "fallback",
                    inherited,
                });
            }
        }
    }
    references
}

fn connect_agent_model(
    graph: &mut RouteGraph,
    agent_node_id: &str,
    agent_id: &str,
    reference: &ModelReference,
    provider_models: &BTreeMap<String, BTreeSet<String>>,
) {
    let Some((provider_id, model_id)) = reference.value.split_once('/') else {
        graph.diagnostics.push(RouteDiagnostic {
            code: DiagnosticCode::MissingModel,
            severity: DiagnosticSeverity::Error,
            message: format!(
                "Agent {agent_id} 引用的模型 {} 不是 provider/model 格式",
                reference.value
            ),
            binding_index: None,
            node_ids: vec![agent_node_id.to_string()],
            data: Some(value_object([(
                "model",
                Value::String(reference.value.clone()),
            )])),
        });
        return;
    };

    let Some(models) = provider_models.get(provider_id) else {
        graph.diagnostics.push(RouteDiagnostic {
            code: DiagnosticCode::MissingProvider,
            severity: DiagnosticSeverity::Error,
            message: format!("Agent {agent_id} 引用了不存在的 provider {provider_id}"),
            binding_index: None,
            node_ids: vec![agent_node_id.to_string()],
            data: Some(value_object([(
                "model",
                Value::String(reference.value.clone()),
            )])),
        });
        return;
    };
    if !models.contains(model_id) {
        graph.diagnostics.push(RouteDiagnostic {
            code: DiagnosticCode::MissingModel,
            severity: DiagnosticSeverity::Error,
            message: format!(
                "Agent {agent_id} 引用了 provider {provider_id} 中不存在的模型 {model_id}"
            ),
            binding_index: None,
            node_ids: vec![agent_node_id.to_string(), node_id("provider", provider_id)],
            data: Some(value_object([(
                "model",
                Value::String(reference.value.clone()),
            )])),
        });
        return;
    }

    let model_node_id = node_id("model", &reference.value);
    graph.edges.push(RouteEdge {
        id: edge_id(
            "usesModel",
            agent_node_id,
            &model_node_id,
            Some(&format!("{}:{}", reference.role, reference.inherited)),
        ),
        kind: EdgeKind::UsesModel,
        source: agent_node_id.to_string(),
        target: model_node_id,
        data: Some(value_object([
            ("role", Value::String(reference.role.to_string())),
            ("inherited", Value::Bool(reference.inherited)),
        ])),
    });
}

fn build_binding_edges(
    snapshot: &Value,
    graph: &mut RouteGraph,
    agent_ids: &BTreeSet<String>,
    channel_accounts: &BTreeMap<String, BTreeSet<String>>,
) {
    let Some(bindings) = snapshot.get("bindings").and_then(Value::as_array) else {
        return;
    };
    let mut records = Vec::new();

    for (index, binding) in bindings.iter().enumerate() {
        let Some(binding) = binding.as_object() else {
            push_invalid_binding(graph, index, "binding 必须是对象", binding);
            continue;
        };
        let agent_id = match binding.get("agentId") {
            None => "main".to_string(),
            Some(value) => match value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                Some(value) => value.to_string(),
                None => {
                    push_invalid_binding(
                        graph,
                        index,
                        "agentId 必须是非空字符串",
                        &Value::Object(binding.clone()),
                    );
                    continue;
                }
            },
        };
        let Some(match_value) = binding.get("match") else {
            push_invalid_binding(
                graph,
                index,
                "binding 缺少 match 对象",
                &Value::Object(binding.clone()),
            );
            continue;
        };
        let Some(match_object) = match_value.as_object() else {
            push_invalid_binding(graph, index, "match 必须是对象", match_value);
            continue;
        };
        let Some(channel_id) = match_object
            .get("channel")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            push_invalid_binding(graph, index, "match.channel 必须是非空字符串", match_value);
            continue;
        };
        let account_id = match match_object.get("accountId") {
            None => None,
            Some(value) => match value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                Some(value) => Some(value.to_string()),
                None => {
                    push_invalid_binding(
                        graph,
                        index,
                        "match.accountId 必须是非空字符串",
                        match_value,
                    );
                    continue;
                }
            },
        };
        let normalized_match =
            normalize_match(match_value).unwrap_or_else(|| Value::Object(Map::new()));
        let route_key = serde_json::to_string(&normalized_match).unwrap_or_default();
        let record = BindingRecord {
            index,
            agent_id,
            channel_id: channel_id.to_string(),
            account_id,
            normalized_match,
            route_key,
        };
        diagnose_binding_references(&record, graph, agent_ids, channel_accounts);
        records.push(record);
    }

    diagnose_binding_collisions(&records, graph);
    for record in records {
        if !agent_ids.contains(&record.agent_id) {
            continue;
        }
        let Some((resolved_channel, accounts)) =
            resolve_channel(&record.channel_id, channel_accounts)
        else {
            continue;
        };
        let source = if let Some(account_id) = &record.account_id {
            if !accounts.contains(account_id) {
                continue;
            }
            node_id("account", &format!("{resolved_channel}/{account_id}"))
        } else {
            node_id("channel", resolved_channel)
        };
        let target = node_id("agent", &record.agent_id);
        graph.edges.push(RouteEdge {
            id: edge_id(
                "routesTo",
                &source,
                &target,
                Some(&record.index.to_string()),
            ),
            kind: EdgeKind::RoutesTo,
            source,
            target,
            data: Some(value_object([
                ("bindingIndex", Value::from(record.index as u64)),
                ("match", record.normalized_match),
            ])),
        });
    }
}

fn diagnose_binding_references(
    record: &BindingRecord,
    graph: &mut RouteGraph,
    agent_ids: &BTreeSet<String>,
    channel_accounts: &BTreeMap<String, BTreeSet<String>>,
) {
    if !agent_ids.contains(&record.agent_id) {
        graph.diagnostics.push(RouteDiagnostic {
            code: DiagnosticCode::MissingAgent,
            severity: DiagnosticSeverity::Error,
            message: format!(
                "binding {} 指向不存在的 Agent {}",
                record.index, record.agent_id
            ),
            binding_index: Some(record.index),
            node_ids: Vec::new(),
            data: Some(value_object([(
                "agentId",
                Value::String(record.agent_id.clone()),
            )])),
        });
    }
    let Some((resolved_channel, accounts)) = resolve_channel(&record.channel_id, channel_accounts)
    else {
        graph.diagnostics.push(RouteDiagnostic {
            code: DiagnosticCode::MissingChannel,
            severity: DiagnosticSeverity::Error,
            message: format!(
                "binding {} 引用了不存在的渠道 {}",
                record.index, record.channel_id
            ),
            binding_index: Some(record.index),
            node_ids: Vec::new(),
            data: Some(value_object([(
                "channelId",
                Value::String(record.channel_id.clone()),
            )])),
        });
        return;
    };
    if let Some(account_id) = &record.account_id {
        if !accounts.contains(account_id) {
            graph.diagnostics.push(RouteDiagnostic {
                code: DiagnosticCode::MissingAccount,
                severity: DiagnosticSeverity::Error,
                message: format!(
                    "binding {} 引用了渠道 {} 中不存在的账号 {}",
                    record.index, record.channel_id, account_id
                ),
                binding_index: Some(record.index),
                node_ids: vec![node_id("channel", resolved_channel)],
                data: Some(value_object([
                    ("channelId", Value::String(record.channel_id.clone())),
                    ("accountId", Value::String(account_id.clone())),
                ])),
            });
        }
    }
}

fn diagnose_binding_collisions(records: &[BindingRecord], graph: &mut RouteGraph) {
    let mut groups: BTreeMap<&str, Vec<&BindingRecord>> = BTreeMap::new();
    for record in records {
        groups.entry(&record.route_key).or_default().push(record);
    }
    for group in groups.values().filter(|group| group.len() > 1) {
        let mut by_agent: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
        for record in group {
            by_agent
                .entry(&record.agent_id)
                .or_default()
                .push(record.index);
        }
        for (agent_id, indices) in &by_agent {
            if indices.len() > 1 {
                graph.diagnostics.push(RouteDiagnostic {
                    code: DiagnosticCode::DuplicateBinding,
                    severity: DiagnosticSeverity::Warning,
                    message: format!(
                        "bindings {} 对 Agent {} 定义了重复的完整 match",
                        join_indices(indices),
                        agent_id
                    ),
                    binding_index: indices.first().copied(),
                    node_ids: vec![node_id("agent", agent_id)],
                    data: Some(value_object([
                        ("bindingIndices", indices_value(indices)),
                        ("match", group[0].normalized_match.clone()),
                    ])),
                });
            }
        }
        if by_agent.len() > 1 {
            let indices: Vec<usize> = group.iter().map(|record| record.index).collect();
            let agents: Vec<Value> = by_agent
                .keys()
                .map(|agent| Value::String((*agent).to_string()))
                .collect();
            graph.diagnostics.push(RouteDiagnostic {
                code: DiagnosticCode::CompetingBinding,
                severity: DiagnosticSeverity::Error,
                message: format!(
                    "bindings {} 用相同的完整 match 路由到多个 Agent",
                    join_indices(&indices)
                ),
                binding_index: indices.first().copied(),
                node_ids: by_agent
                    .keys()
                    .map(|agent| node_id("agent", agent))
                    .collect(),
                data: Some(value_object([
                    ("bindingIndices", indices_value(&indices)),
                    ("agentIds", Value::Array(agents)),
                    ("match", group[0].normalized_match.clone()),
                ])),
            });
        }
    }
}

fn push_invalid_binding(graph: &mut RouteGraph, index: usize, message: &str, value: &Value) {
    graph.diagnostics.push(RouteDiagnostic {
        code: DiagnosticCode::InvalidBinding,
        severity: DiagnosticSeverity::Error,
        message: format!("binding {index} 无效: {message}"),
        binding_index: Some(index),
        node_ids: Vec::new(),
        data: Some(value_object([("binding", value.clone())])),
    });
}

fn normalize_match(value: &Value) -> Option<Value> {
    match value {
        Value::Null => None,
        Value::String(value) => Some(Value::String(value.trim().to_string())),
        Value::Array(values) => {
            let mut normalized: Vec<Value> = values.iter().filter_map(normalize_match).collect();
            if normalized.iter().all(Value::is_string) {
                normalized.sort_by(|left, right| left.as_str().cmp(&right.as_str()));
            }
            Some(Value::Array(normalized))
        }
        Value::Object(values) => {
            let mut keys: Vec<&String> = values.keys().collect();
            keys.sort();
            let mut normalized = Map::new();
            for key in keys {
                let item = &values[key];
                if key == "peer" {
                    if let Some(peer_id) = item
                        .as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                    {
                        normalized.insert(
                            key.clone(),
                            value_object([
                                ("kind", Value::String("direct".to_string())),
                                ("id", Value::String(peer_id.to_string())),
                            ]),
                        );
                    } else if let Some(peer) = item.as_object() {
                        let kind = peer
                            .get("kind")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .unwrap_or("direct");
                        if let Some(peer_id) = peer
                            .get("id")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                        {
                            normalized.insert(
                                key.clone(),
                                value_object([
                                    ("kind", Value::String(kind.to_string())),
                                    ("id", Value::String(peer_id.to_string())),
                                ]),
                            );
                        }
                    }
                    continue;
                }
                let Some(item) = normalize_match(item) else {
                    continue;
                };
                if item.as_str().map(str::is_empty).unwrap_or(false) {
                    continue;
                }
                normalized.insert(key.clone(), item);
            }
            Some(Value::Object(normalized))
        }
        _ => Some(value.clone()),
    }
}

fn resolve_channel<'a>(
    channel_id: &str,
    channels: &'a BTreeMap<String, BTreeSet<String>>,
) -> Option<(&'a str, &'a BTreeSet<String>)> {
    if let Some((key, accounts)) = channels.get_key_value(channel_id) {
        return Some((key.as_str(), accounts));
    }
    let storage_id = match channel_id {
        "dingtalk" => "dingtalk-connector",
        "weixin" => "openclaw-weixin",
        _ => return None,
    };
    channels
        .get_key_value(storage_id)
        .map(|(key, accounts)| (key.as_str(), accounts))
}

fn node_id(kind: &str, key: &str) -> String {
    format!("{kind}:{key}")
}

fn edge_id(kind: &str, source: &str, target: &str, suffix: Option<&str>) -> String {
    match suffix {
        Some(suffix) => format!("{kind}:{source}->{target}:{suffix}"),
        None => format!("{kind}:{source}->{target}"),
    }
}

fn value_object<const N: usize>(entries: [(&str, Value); N]) -> Value {
    Value::Object(
        entries
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect::<Map<String, Value>>(),
    )
}

fn indices_value(indices: &[usize]) -> Value {
    Value::Array(
        indices
            .iter()
            .map(|index| Value::from(*index as u64))
            .collect(),
    )
}

fn join_indices(indices: &[usize]) -> String {
    indices
        .iter()
        .map(usize::to_string)
        .collect::<Vec<_>>()
        .join(", ")
}

fn diagnostic_code_key(code: DiagnosticCode) -> &'static str {
    match code {
        DiagnosticCode::MissingAgent => "missing_agent",
        DiagnosticCode::MissingChannel => "missing_channel",
        DiagnosticCode::MissingAccount => "missing_account",
        DiagnosticCode::MissingProvider => "missing_provider",
        DiagnosticCode::MissingModel => "missing_model",
        DiagnosticCode::InvalidBinding => "invalid_binding",
        DiagnosticCode::DuplicateBinding => "duplicate_binding",
        DiagnosticCode::CompetingBinding => "competing_binding",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn temp_root(test_name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "route-graph-{test_name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn codes(graph: &RouteGraph) -> Vec<DiagnosticCode> {
        graph.diagnostics.iter().map(|item| item.code).collect()
    }

    #[test]
    fn strict_reader_accepts_bom_without_changing_file() {
        let root = temp_root("bom");
        let path = root.join("openclaw.json");
        let original = b"\xef\xbb\xbf{\"agents\":{\"list\":[]}}".to_vec();
        fs::write(&path, &original).unwrap();

        assert!(read_snapshot(&path).unwrap().is_object());
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strict_reader_rejects_invalid_utf8_and_json_without_repair_or_backup() {
        let root = temp_root("invalid");
        let path = root.join("openclaw.json");
        let backup = root.join("openclaw.json.bak");
        let invalid_utf8 = vec![0xff, b'{', b'}'];
        fs::write(&path, &invalid_utf8).unwrap();
        fs::write(&backup, b"{}").unwrap();
        assert!(read_snapshot(&path).unwrap_err().contains("UTF-8"));
        assert_eq!(fs::read(&path).unwrap(), invalid_utf8);

        let invalid_json = b"{\"bindings\": [1,]}".to_vec();
        fs::write(&path, &invalid_json).unwrap();
        assert!(read_snapshot(&path).unwrap_err().contains("JSON"));
        assert_eq!(fs::read(&path).unwrap(), invalid_json);
        assert_eq!(fs::read(&backup).unwrap(), b"{}");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn normalizes_agents_models_channels_accounts_and_complete_matches() {
        let snapshot = json!({
            "models": {"providers": {
                "openai": {"name":"OpenAI", "models":[{"id":"gpt-5","name":"GPT 5"}, "gpt-4"]}
            }},
            "agents": {
                "defaults": {"model":{"primary":"openai/gpt-5","fallbacks":["openai/gpt-4"]}},
                "list": [
                    {"id":"writer","identity":{"name":"Writer"},"model":"openai/gpt-4"},
                    {"id":"inherited-null","model":null}
                ]
            },
            "channels": {
                "telegram":{"enabled":true,"botToken":"secret"},
                "feishu":{"accounts":{"blue":{"enabled":true},"red":{"enabled":true}}}
            },
            "bindings": [
                {"agentId":"writer","match":{"channel":"feishu","accountId":"blue","peer":{"kind":"group","id":"g-1"},"roles":["beta","alpha"]}},
                {"match":{"channel":"telegram"}}
            ]
        });
        let graph = build_route_graph(&snapshot).unwrap();

        assert!(graph.nodes.iter().any(|node| node.id == "agent:main"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "account:telegram/default"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "account:feishu/blue"));
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.kind == EdgeKind::Provides)
                .count(),
            2
        );
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.kind == EdgeKind::UsesModel)
                .count(),
            5
        );
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.kind == EdgeKind::RoutesTo)
                .count(),
            2
        );
        let detailed = graph
            .edges
            .iter()
            .find(|edge| edge.source == "account:feishu/blue")
            .unwrap();
        assert_eq!(
            detailed.data.as_ref().unwrap()["match"]["peer"]["id"],
            "g-1"
        );
        assert_eq!(
            detailed.data.as_ref().unwrap()["match"]["roles"],
            json!(["alpha", "beta"])
        );
        assert!(graph.diagnostics.is_empty());
    }

    #[test]
    fn reports_all_missing_reference_diagnostics() {
        let snapshot = json!({
            "models":{"providers":{"known":{"models":[{"id":"present"}]}}},
            "agents":{"list":[
                {"id":"bad-provider","model":"absent/model"},
                {"id":"bad-model","model":{"primary":"known/absent"}}
            ]},
            "channels":{"telegram":{"accounts":{"real":{}}}},
            "bindings":[
                {"agentId":"ghost","match":{"channel":"telegram","accountId":"real"}},
                {"agentId":"main","match":{"channel":"ghost-channel"}},
                {"agentId":"main","match":{"channel":"telegram","accountId":"ghost-account"}}
            ]
        });
        let graph = build_route_graph(&snapshot).unwrap();
        let found = codes(&graph);
        for expected in [
            DiagnosticCode::MissingAgent,
            DiagnosticCode::MissingChannel,
            DiagnosticCode::MissingAccount,
            DiagnosticCode::MissingProvider,
            DiagnosticCode::MissingModel,
        ] {
            assert!(found.contains(&expected), "missing diagnostic {expected:?}");
        }
    }

    #[test]
    fn reports_invalid_duplicate_and_competing_bindings_by_full_match() {
        let snapshot = json!({
            "agents":{"list":[{"id":"alpha"},{"id":"beta"}]},
            "channels":{"telegram":{"accounts":{"bot":{}}}},
            "bindings":[
                null,
                {"agentId":"alpha"},
                {"agentId":"alpha","match":{"channel":"telegram","accountId":"bot","peer":{"id":"room","kind":"group"},"roles":["admin","user"]}},
                {"agentId":"alpha","match":{"roles":["user","admin"],"peer":{"kind":"group","id":"room"},"accountId":"bot","channel":"telegram","unused":null}},
                {"agentId":"beta","match":{"channel":"telegram","accountId":"bot","peer":{"kind":"group","id":"room"},"roles":["admin","user"]}},
                {"agentId":"beta","match":{"channel":"telegram","accountId":"bot","peer":"direct-room","roles":["admin","user"]}},
                {"agentId":"alpha","match":{"channel":"telegram","accountId":"bot","peer":{"id":"direct-room"},"roles":["admin","user"]}}
            ]
        });
        let graph = build_route_graph(&snapshot).unwrap();
        let found = codes(&graph);
        assert_eq!(
            found
                .iter()
                .filter(|code| **code == DiagnosticCode::InvalidBinding)
                .count(),
            2
        );
        assert!(found.contains(&DiagnosticCode::DuplicateBinding));
        assert!(found.contains(&DiagnosticCode::CompetingBinding));
        assert_eq!(
            found
                .iter()
                .filter(|code| **code == DiagnosticCode::CompetingBinding)
                .count(),
            2
        );
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.kind == EdgeKind::RoutesTo)
                .count(),
            5
        );
    }
}
