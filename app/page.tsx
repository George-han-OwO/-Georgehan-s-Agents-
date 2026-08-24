'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

type View = 'chat' | 'tasks' | 'fleet' | 'activity' | 'api';
type Tone = 'plum' | 'lime' | 'orange' | 'blue' | 'pink' | 'slate' | 'mint';

type Agent = {
  id: string;
  name: string;
  role: string;
  state: string;
  truth: string;
  tone: Tone;
  leader?: boolean;
  capabilities: string[];
  task?: string;
  tokens: string;
  tool: string;
};

type Device = {
  id: string;
  name: string;
  meta: string;
  load: number;
  agents: Agent[];
};

type Task = {
  id: string;
  title: string;
  owner: string;
  status: '执行中' | '待认领' | '等待主人' | '已完成';
  progress: number;
  eta: string;
  priority: '高' | '中' | '低';
  path: string[];
  reason: string;
};

type FeedItem =
  | { id: string; kind: 'message'; text: string; at: string }
  | { id: string; kind: 'task'; task: Task; at: string };

const OWNER_NAME = 'George';

const devices: Device[] = [
  {
    id: 'study', name: '书房主机', meta: 'Windows · 心跳 2 秒前', load: 38,
    agents: [
      { id: 'mochi', name: 'Mochi', role: '统筹 / 产品', state: '正在拆解任务', truth: '执行中 · #T-028', tone: 'plum', leader: true, capabilities: ['规划', '协调', '产品'], task: '#T-028 竞品研究', tokens: '12.4k / 40k', tool: '任务编排器' },
      { id: 'pixel', name: 'Pixel', role: '全栈开发', state: '正在和 TypeScript 讲道理', truth: '空闲 · 可接单', tone: 'blue', capabilities: ['前端', '后端', '调试'], tokens: '0 / 60k', tool: '待命' },
      { id: 'muse', name: 'Muse', role: '视觉设计', state: '正在摆弄几个像素', truth: '执行中 · #T-027', tone: 'pink', capabilities: ['视觉', '品牌', '原型'], task: '#T-027 落地页文案', tokens: '8.1k / 30k', tool: '设计画板' },
    ],
  },
  {
    id: 'workstation', name: '工作站', meta: 'macOS · 心跳刚刚', load: 54,
    agents: [
      { id: 'nova', name: 'Nova', role: '研究 / 搜索', state: '正在听 Never Gonna Give You Up', truth: '协作中 · #T-028', tone: 'lime', leader: true, capabilities: ['研究', '搜索', '验证'], task: '#T-028 竞品研究', tokens: '18.7k / 50k', tool: '网页浏览器' },
      { id: 'quill', name: 'Quill', role: '写作编辑', state: '正在给句号找位置', truth: '空闲 · 可接单', tone: 'slate', capabilities: ['写作', '编辑', '总结'], tokens: '0 / 35k', tool: '待命' },
    ],
  },
  {
    id: 'livingroom', name: '客厅小主机', meta: 'Linux · 心跳 4 秒前', load: 21,
    agents: [
      { id: 'lumi', name: 'Lumi', role: '数据 / 审核', state: '正在偷吃 token', truth: '监听中 · 预算正常', tone: 'orange', leader: true, capabilities: ['数据', '审核', '质量'], tokens: '3.2k / 45k', tool: '数据沙盒' },
      { id: 'dozer', name: 'Dozer', role: '夜间值守', state: '正在睡觉', truth: '睡眠 · 可唤醒', tone: 'mint', capabilities: ['监控', '运维', '告警'], tokens: '0 / 20k', tool: '低功耗模式' },
    ],
  },
];

const seedTasks: Task[] = [
  { id: 'T-028', title: '研究多 Agent 协作产品', owner: 'Mochi', status: '执行中', progress: 46, eta: '12 分钟', priority: '高', path: ['Mochi', 'Nova', 'Lumi'], reason: '产品策划能力匹配，当前负载最低' },
  { id: 'T-027', title: '为首页准备首屏文案', owner: 'Muse', status: '执行中', progress: 72, eta: '6 分钟', priority: '中', path: ['Muse'], reason: '视觉与品牌能力匹配' },
  { id: 'T-026', title: '批准生产环境读取权限', owner: '主人', status: '等待主人', progress: 34, eta: '等待决定', priority: '高', path: ['Pixel', 'Mochi'], reason: '涉及外部系统权限，需要主人确认' },
  { id: 'T-025', title: '整理昨日运行报告', owner: 'Quill', status: '已完成', progress: 100, eta: '已交付', priority: '低', path: ['Quill'], reason: '写作与总结能力匹配' },
  { id: 'T-024', title: '检查三台设备心跳', owner: 'Dozer', status: '待认领', progress: 0, eta: '约 3 分钟', priority: '中', path: [], reason: '等待值守 Agent 唤醒' },
];

const navItems: { id: View; label: string; icon: string; count?: number }[] = [
  { id: 'chat', label: '群聊', icon: '⌁', count: 8 },
  { id: 'tasks', label: '任务', icon: '◫', count: 5 },
  { id: 'fleet', label: '设备', icon: '⌘' },
  { id: 'activity', label: '活动', icon: '◎' },
  { id: 'api', label: '接口', icon: '◇' },
];

const statusOrder: Task['status'][] = ['待认领', '执行中', '等待主人', '已完成'];

const getTime = () => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export default function Home() {
  const [activeView, setActiveView] = useState<View>('chat');
  const [draft, setDraft] = useState('');
  const [taskMode, setTaskMode] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [createdTasks, setCreatedTasks] = useState<Task[]>([]);
  const [loopGuarded, setLoopGuarded] = useState(false);
  const [checkpointOutcome, setCheckpointOutcome] = useState<'partial' | 'ask' | null>(null);
  const [routing, setRouting] = useState(false);
  const [notice, setNotice] = useState('');
  const [apiSummary, setApiSummary] = useState<{ status: 'checking' | 'online' | 'offline'; devices: number; agents: number }>({ status: 'checking', devices: 0, agents: 0 });

  useEffect(() => {
    let active = true;
    fetch('/api/v1/health', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('API unavailable');
        const payload = await response.json() as { data?: { devices?: number; agents?: number } };
        if (active) setApiSummary({ status: 'online', devices: payload.data?.devices ?? 0, agents: payload.data?.agents ?? 0 });
      })
      .catch(() => {
        if (active) setApiSummary((current) => ({ ...current, status: 'offline' }));
      });
    return () => { active = false; };
  }, []);

  const allAgents = useMemo(() => devices.flatMap((device) => device.agents), []);
  const allTasks = useMemo(() => [...createdTasks, ...seedTasks], [createdTasks]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const chooseAgent = (text: string) => {
    if (/代码|开发|bug|网站|程序/i.test(text)) return allAgents.find((agent) => agent.id === 'pixel')!;
    if (/写|文案|总结|报告/i.test(text)) return allAgents.find((agent) => agent.id === 'quill')!;
    if (/数据|审核|检查|分析/i.test(text)) return allAgents.find((agent) => agent.id === 'lumi')!;
    if (/搜索|调研|研究|资料/i.test(text)) return allAgents.find((agent) => agent.id === 'nova')!;
    return allAgents.find((agent) => agent.id === 'mochi')!;
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const at = getTime();
    if (taskMode) {
      const agent = chooseAgent(text);
      const task: Task = {
        id: `T-${String(29 + createdTasks.length).padStart(3, '0')}`,
        title: text.replace(/@\S+/g, '').trim(), owner: agent.name, status: '执行中', progress: 8,
        eta: '正在估算', priority: '中', path: [agent.name], reason: `匹配「${agent.capabilities.slice(0, 2).join('、')}」能力，且当前可接单`,
      };
      setCreatedTasks((current) => [task, ...current]);
      setFeedItems((current) => [...current, { id: `${Date.now()}-m`, kind: 'message', text, at }, { id: `${Date.now()}-t`, kind: 'task', task, at }]);
      flash(`${agent.name} 已接受任务 ${task.id}`);
    } else {
      setFeedItems((current) => [...current, { id: `${Date.now()}`, kind: 'message', text, at }]);
      flash(text.includes('@') ? '已通知被 @ 的 Agent' : '消息已发到作战室');
    }
    setDraft('');
    setTaskMode(false);
    setMentionOpen(false);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  };

  const insertMention = (name: string) => {
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${name} `);
    setMentionOpen(false);
  };

  const showLoopGuard = () => {
    setLoopGuarded(true);
    setCheckpointOutcome(null);
    setSelectedTask(seedTasks[0]);
    flash('检测到 Mochi → Nova → Lumi → Mochi 闭环，已阻止继续转交');
  };

  const resolveCheckpoint = (outcome: 'partial' | 'ask') => {
    setCheckpointOutcome(outcome);
    flash(outcome === 'partial' ? '已提交带局限说明的阶段结果' : '已向主人生成一次合并询问');
  };

  return (
    <main className={`war-room ${paused ? 'is-paused' : ''}`}>
      <header className="topbar">
        <button className="brand-button" aria-label="回到群聊" onClick={() => setActiveView('chat')}>
          <span className="brand-mark">M</span>
          <span className="brand-copy"><strong>Murmur</strong><small>Agent 作战室</small></span>
        </button>
        <div className="room-title"><span className={`live-dot ${apiSummary.status !== 'online' ? 'muted' : ''}`} /><div><strong>{OWNER_NAME} 的 Agent 们</strong><small>{paused ? '全局已暂停' : apiSummary.status === 'online' ? `接口在线 · ${apiSummary.devices} 台真实设备已接入` : '正在连接通用接口…'}</small></div></div>
        <div className="header-actions">
          <button className={`pause-button ${paused ? 'active' : ''}`} onClick={() => { setPaused((value) => !value); flash(paused ? '全体 Agent 已恢复' : '全体 Agent 已暂停'); }}><span>{paused ? '▶' : 'Ⅱ'}</span>{paused ? '恢复全体' : '暂停全体'}</button>
          <button className="owner-chip"><span>主</span> {OWNER_NAME}</button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="主导航">
          {navItems.map((item) => <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => { setActiveView(item.id); setSelectedTask(null); }}><span>{item.icon}</span>{item.label}{item.count ? <em>{item.count}</em> : null}</button>)}
        </nav>
        <div className="side-section">
          <p>正在推进</p>
          {allTasks.filter((task) => task.status === '执行中').slice(0, 3).map((task, index) => (
            <button key={task.id} className={`mini-task ${index === 0 ? 'active' : ''}`} onClick={() => { setSelectedTask(task); setSelectedAgent(null); }}>
              <span className={`task-glyph ${index ? 'coral' : ''}`}>{index ? '✦' : '↗'}</span><span><b>{task.title}</b><small>#{task.id} · {task.owner}</small></span>
            </button>
          ))}
        </div>
        <div className="side-section rules-box"><p>房间规则</p><div><span>↻</span><b>禁止无限转交</b><small>一轮后必须交付或询问主人</small></div></div>
        <div className="side-footer"><span className="pulse-icon">⌁</span><span><b>连接正常</b><small>刚刚完成同步</small></span></div>
      </aside>

      <section className={`main-panel ${activeView !== 'chat' ? 'view-mode' : ''}`}>
        {activeView === 'chat' && (
          <>
            <div className="chat-scroll">
              <div className="day-divider"><span>今天 14:32</span></div>
              <OwnerMessage text="帮我研究多 Agent 协作产品，给一个可以直接开工的方案。" mention="@所有老大" at="14:32" />
              <TaskEvent task={seedTasks[0]} onOpen={() => setSelectedTask(seedTasks[0])} onGuard={showLoopGuard} guarded={loopGuarded} />
              <AgentMessage />
              <div className="handoff-line"><span>⌁</span><p><b>Mochi</b> 向 <b>Nova</b> 发起协作咨询 <small>负责人仍为 Mochi</small></p><time>14:34</time></div>
              <div className="message compact-message">
                <button className="avatar lime-avatar" onClick={() => setSelectedAgent(allAgents.find((agent) => agent.id === 'nova')!)}>N</button>
                <div className="message-body"><div className="message-meta"><b>Nova</b><span className="lead-tag">♛ 工作站老大</span><time>14:36</time></div><p>收到。我会验证跨设备路由和循环交接边界，<mark>@Lumi</mark> 帮我看一下审计规则。</p></div>
              </div>
              {loopGuarded && <CheckpointCard outcome={checkpointOutcome} onResolve={resolveCheckpoint} />}
              {feedItems.map((item) => item.kind === 'message'
                ? <OwnerMessage key={item.id} text={item.text} at={item.at} />
                : <TaskEvent key={item.id} task={item.task} onOpen={() => setSelectedTask(item.task)} />
              )}
              {paused && <div className="paused-banner"><span>Ⅱ</span><div><b>作战室已暂停</b><small>Agent 保留上下文，但不会继续调用工具或转交任务。</small></div></div>}
            </div>
            <Composer draft={draft} setDraft={setDraft} taskMode={taskMode} setTaskMode={setTaskMode} mentionOpen={mentionOpen} setMentionOpen={setMentionOpen} agents={allAgents} insertMention={insertMention} send={send} onKeyDown={onComposerKeyDown} disabled={paused} />
          </>
        )}
        {activeView === 'tasks' && <TasksView tasks={allTasks} onSelect={(task) => { setSelectedTask(task); setSelectedAgent(null); }} onGuard={showLoopGuard} />}
        {activeView === 'fleet' && <FleetView devices={devices} routing={routing} onRoute={() => { setRouting(true); flash('正在模拟：书房主机 → 工作站 → 客厅小主机'); window.setTimeout(() => setRouting(false), 2800); }} onAgent={(agent) => { setSelectedAgent(agent); setSelectedTask(null); }} />}
        {activeView === 'activity' && <ActivityView />}
        {activeView === 'api' && <ApiView apiSummary={apiSummary} />}
      </section>

      <aside className={`presence-panel ${selectedAgent || selectedTask ? 'inspector-open' : ''}`}>
        {selectedAgent ? <AgentInspector agent={selectedAgent} onBack={() => setSelectedAgent(null)} />
          : selectedTask ? <TaskInspector task={selectedTask} loopGuarded={loopGuarded} outcome={checkpointOutcome} onBack={() => setSelectedTask(null)} onGuard={showLoopGuard} onResolve={resolveCheckpoint} />
          : <Presence devices={devices} onAgent={(agent) => setSelectedAgent(agent)} onFleet={() => setActiveView('fleet')} />}
      </aside>

      <nav className="mobile-tabs" aria-label="移动端导航">
        {navItems.slice(0, 3).map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => setActiveView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </main>
  );
}

function OwnerMessage({ text, mention, at }: { text: string; mention?: string; at: string }) {
  return <div className="message owner-message"><div className="avatar owner-avatar">主</div><div className="message-body"><div className="message-meta"><b>{OWNER_NAME}</b><span>主人</span><time>{at}</time></div><p>{text} {mention && <mark>{mention}</mark>}</p></div></div>;
}

function AgentMessage() {
  return <div className="message"><div className="avatar plum-avatar">M<span className="status-dot" /></div><div className="message-body"><div className="message-meta"><b>Mochi</b><span className="lead-tag">♛ 书房老大</span><time>14:33</time></div><p>我来负责。我会先画清任务协议，再请 <mark>@Nova</mark> 验证跨设备通信，15 分钟后给主人第一版。</p><div className="thinking"><i /><span>正在梳理产品架构</span><b>01:42</b></div></div></div>;
}

function TaskEvent({ task, onOpen, onGuard, guarded }: { task: Task; onOpen: () => void; onGuard?: () => void; guarded?: boolean }) {
  return <article className="task-event"><div className="event-top"><span className="event-icon">↗</span><div><small>任务 · #{task.id}</small><h2>{task.title}</h2></div><span className={`priority p-${task.priority}`}>{task.priority}优先级</span></div><div className="event-route"><span>主人发布</span><i>→</i><span className="chosen">{task.owner} 接单</span><i>→</i><span>{task.progress}% 进行中</span></div><div className="event-foot"><span className="stacked-avatars"><i>M</i><i>N</i><i>L</i></span><span><b>{task.owner}</b> {task.reason}</span><div className="event-buttons">{onGuard && <button onClick={onGuard}>{guarded ? '已触发保护' : '演示防踢皮球'}</button>}<button onClick={onOpen}>查看任务</button></div></div></article>;
}

function CheckpointCard({ outcome, onResolve }: { outcome: 'partial' | 'ask' | null; onResolve: (outcome: 'partial' | 'ask') => void }) {
  return <article className="checkpoint-card" aria-live="polite"><div className="checkpoint-head"><span>!</span><div><small>DECISION CHECKPOINT · 已阻止循环</small><h3>任务不能再被“踢皮球”</h3></div></div><div className="loop-route"><b>Mochi</b><i>→</i><b>Nova</b><i>→</i><b>Lumi</b><i>↛</i><b className="blocked-node">Mochi</b></div><p>系统发现下一位接收者已经在本轮路径中。当前负责人 Lumi 不能继续转交，必须提交现有结果，或把一个合并后的最小问题交给主人。</p>{!outcome ? <div className="checkpoint-actions"><button onClick={() => onResolve('partial')}>提交阶段结果</button><button className="dark" onClick={() => onResolve('ask')}>询问主人</button></div> : <div className="checkpoint-result"><span>✓</span><div><b>{outcome === 'partial' ? '已提交阶段结果' : '已进入等待主人'}</b><small>{outcome === 'partial' ? '包含已完成内容、信心和未解决风险。' : '只生成一次合并询问，并暂停本轮自动转交。'}</small></div></div>}</article>;
}

type ComposerProps = {
  draft: string; setDraft: (value: string) => void; taskMode: boolean; setTaskMode: (value: boolean) => void;
  mentionOpen: boolean; setMentionOpen: (value: boolean) => void; agents: Agent[]; insertMention: (name: string) => void;
  send: () => void; onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void; disabled: boolean;
};

function Composer({ draft, setDraft, taskMode, setTaskMode, mentionOpen, setMentionOpen, agents, insertMention, send, onKeyDown, disabled }: ComposerProps) {
  return <div className="composer-wrap"><div className={`composer ${taskMode ? 'task-mode' : ''} ${disabled ? 'disabled' : ''}`}><div className="mode-bar">{taskMode ? <><span>↗</span><b>任务模式</b><small>发送后按能力与负载自动接单</small><button onClick={() => setTaskMode(false)}>×</button></> : null}</div><textarea aria-label="给 Agent 发送消息" placeholder={disabled ? '全局已暂停，恢复后才能发送…' : '给主人们布置任务，或输入 @ 召唤 Agent…'} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} /><div className="composer-actions"><div><button aria-label="添加附件">＋</button><div className="mention-anchor"><button aria-expanded={mentionOpen} onClick={() => setMentionOpen(!mentionOpen)}>@</button>{mentionOpen && <div className="mention-menu"><small>召唤 Agent</small>{agents.map((agent) => <button key={agent.id} onClick={() => insertMention(agent.name)}><span className={`mini-avatar ${agent.tone}`}>{agent.name[0]}</span><span><b>{agent.name}</b><small>{agent.role}</small></span>{agent.leader && <em>老大</em>}</button>)}</div>}</div><button className={`task-toggle ${taskMode ? 'active' : ''}`} onClick={() => setTaskMode(!taskMode)}>↗ 转为任务</button></div><button className="send-button" onClick={send} disabled={disabled || !draft.trim()}>发送 <span>⌘↵</span></button></div></div><p className="composer-hint">Agent 会按能力和负载自行接单 · 形成转交闭环时会自动请示主人</p></div>;
}

function Presence({ devices, onAgent, onFleet }: { devices: Device[]; onAgent: (agent: Agent) => void; onFleet: () => void }) {
  return <><div className="presence-head"><div><span className="eyebrow">LIVE PRESENCE</span><h2>现场状态</h2></div><button aria-label="更多选项">•••</button></div><div className="fleet-summary"><div><span>设备在线</span><b>3<span>/3</span></b></div><div><span>Agent 工作中</span><b>4<span>/7</span></b></div><i style={{ '--progress': '67%' } as CSSProperties} /></div><div className="device-list">{devices.map((device) => <article className="device-card" key={device.id}><div className="device-top"><span className="device-icon">▰</span><b>{device.name}</b><span className="online-pill">在线</span><span className="device-load">{device.load}%</span></div>{device.agents.map((agent) => <button className="agent-row" key={agent.id} onClick={() => onAgent(agent)}><span className={`avatar ${agent.tone}-avatar`}>{agent.name[0]}<i className={`status-dot ${agent.truth.includes('睡眠') ? 'sleep' : ''}`} /></span><span className="agent-copy"><span><b>{agent.name}</b>{agent.leader && <em>♛ 本机老大</em>}</span><small>{agent.state}</small></span><span className="truth-state">{agent.truth.split(' · ')[0]}</span></button>)}</article>)}</div><button className="fleet-button" onClick={onFleet}>查看完整设备拓扑 <span>→</span></button></>;
}

function AgentInspector({ agent, onBack }: { agent: Agent; onBack: () => void }) {
  return <div className="inspector"><button className="back-button" onClick={onBack}>← 返回现场</button><div className="agent-hero"><div className={`avatar big ${agent.tone}-avatar`}>{agent.name[0]}<span className="status-dot" /></div><div><span className="eyebrow">AGENT INSPECTOR</span><h2>{agent.name}</h2><p>{agent.role}</p></div></div>{agent.leader && <div className="leader-callout"><span>♛</span><div><b>本机唯一老大</b><small>负责本设备的心跳、能力汇总与本机调度</small></div></div>}<section className="inspector-section"><small>可信状态</small><div className="truth-card"><span className="live-dot" /><div><b>{agent.truth}</b><small>系统事件 · 刚刚更新</small></div></div><div className="fun-status"><span>趣味状态</span><p>“{agent.state}”</p><small>Agent 自报 · 2 分钟后过期</small></div></section><section className="inspector-section"><small>当前资源</small><div className="metric-grid"><div><span>Token</span><b>{agent.tokens}</b></div><div><span>当前工具</span><b>{agent.tool}</b></div></div></section><section className="inspector-section"><small>能力</small><div className="tag-list">{agent.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section><section className="inspector-section"><small>最近活动</small><ul className="activity-mini"><li><i />更新了执行进度 <time>刚刚</time></li><li><i />同步设备心跳 <time>12 秒前</time></li><li><i />读取公开任务上下文 <time>1 分钟前</time></li></ul></section></div>;
}

function TaskInspector({ task, loopGuarded, outcome, onBack, onGuard, onResolve }: { task: Task; loopGuarded: boolean; outcome: 'partial' | 'ask' | null; onBack: () => void; onGuard: () => void; onResolve: (outcome: 'partial' | 'ask') => void }) {
  return <div className="inspector task-inspector"><button className="back-button" onClick={onBack}>← 返回现场</button><span className="eyebrow">TASK INSPECTOR · #{task.id}</span><h2>{task.title}</h2><div className="task-status-row"><span className={`status-badge s-${task.status}`}>{task.status}</span><span>{task.progress}%</span><span>{task.eta}</span></div><div className="progress-track"><i style={{ width: `${task.progress}%` }} /></div><section className="inspector-section"><small>唯一负责人</small><div className="owner-card"><span className="avatar plum-avatar">{task.owner[0]}</span><div><b>{task.owner}</b><small>{task.reason}</small></div></div></section><section className="inspector-section"><small>委派路径 · {task.path.length}/3</small><div className="task-path">{task.path.length ? task.path.map((node, index) => <span key={`${node}-${index}`}><b>{node}</b>{index < task.path.length - 1 && <i>→</i>}</span>) : <em>尚未分配</em>}</div><p className="policy-copy">同一 Agent 在一轮内只能成为负责人一次；命中已访问节点后，转交会被立即阻止。</p>{task.id === 'T-028' && !loopGuarded && <button className="primary-wide" onClick={onGuard}>模拟再次转交给 Mochi</button>}{task.id === 'T-028' && loopGuarded && <div className="guard-mini"><b>! 循环已阻止</b><small>Lumi ↛ Mochi · 只允许交付或询问主人</small>{!outcome && <div><button onClick={() => onResolve('partial')}>交付阶段结果</button><button onClick={() => onResolve('ask')}>询问主人</button></div>}{outcome && <p>✓ {outcome === 'partial' ? '阶段结果已提交' : '正在等待主人'}</p>}</div>}</section><section className="inspector-section"><small>审计摘要</small><ul className="activity-mini"><li><i />Mochi 自动接单 <time>14:33</time></li><li><i />Nova 接受协作咨询 <time>14:34</time></li><li><i />Lumi 完成规则复核 <time>14:37</time></li></ul></section></div>;
}

function TasksView({ tasks, onSelect, onGuard }: { tasks: Task[]; onSelect: (task: Task) => void; onGuard: () => void }) {
  return <div className="workspace-view tasks-view"><div className="view-header"><div><span className="eyebrow">TASK CONTROL</span><h1>任务不会凭空消失</h1><p>每个任务始终只有一个负责人；咨询和协作不会偷偷改变所有权。</p></div><div className="header-stats"><span><b>{tasks.filter((task) => task.status === '执行中').length}</b>执行中</span><span><b>{tasks.filter((task) => task.status === '等待主人').length}</b>等待主人</span></div></div><div className="board">{statusOrder.map((status) => <section className="board-column" key={status}><div className="column-head"><span className={`column-dot d-${status}`} />{status}<b>{tasks.filter((task) => task.status === status).length}</b></div><div className="column-cards">{tasks.filter((task) => task.status === status).map((task) => <button className="board-card" key={task.id} onClick={() => onSelect(task)}><span className="board-id">#{task.id}<em className={`pri-${task.priority}`}>{task.priority}</em></span><h3>{task.title}</h3><div className="board-owner"><span>{task.owner[0]}</span><b>{task.owner}</b><small>{task.eta}</small></div><div className="mini-progress"><i style={{ width: `${task.progress}%` }} /></div>{task.path.length > 1 && <div className="mini-path">{task.path.join(' → ')}</div>}</button>)}</div></section>)}</div><div className="rule-demo"><span>↻</span><div><b>闭环保护正在工作</b><p>如果 A → B → C 又想回到 A，系统会锁住转交并要求交付或询问主人。</p></div><button onClick={onGuard}>运行一次演示</button></div></div>;
}

function FleetView({ devices, routing, onRoute, onAgent }: { devices: Device[]; routing: boolean; onRoute: () => void; onAgent: (agent: Agent) => void }) {
  return <div className="workspace-view fleet-view"><div className="view-header"><div><span className="eyebrow">FLEET MAP</span><h1>任意数量设备，一个本机老大</h1><p>主人位于设备之上。每台电脑只需要注册一个 Gateway，跨设备消息由两端老大接力，但任务仍只有一个负责人。</p></div><button className="route-button" onClick={onRoute} disabled={routing}>{routing ? '跨设备路由中…' : '模拟跨设备派单'}</button></div><div className={`topology ${routing ? 'routing' : ''}`}><div className="owner-node"><span>主</span><b>主人</b><small>全局规则与最终决定</small></div><div className="topology-lines"><i /><i /><i /><span /></div><div className="device-islands">{devices.map((device, deviceIndex) => <article className="device-island" key={device.id}><div className="island-head"><span>0{deviceIndex + 1}</span><div><b>{device.name}</b><small>{device.meta}</small></div><em>{device.load}% 负载</em></div><div className="island-agents">{device.agents.map((agent) => <button key={agent.id} className={agent.leader ? 'leader' : ''} onClick={() => onAgent(agent)}><span className={`mini-avatar ${agent.tone}`}>{agent.name[0]}</span><span><b>{agent.name}</b><small>{agent.truth}</small></span>{agent.leader && <em>♛ 老大</em>}</button>)}</div></article>)}</div>{routing && <div className="route-caption"><span className="route-pulse" />Mochi → Nova → Lumi：上下文已结构化接力</div>}</div><div className="fleet-rules"><div><span>1</span><b>每台只有一个老大</b><p>使用唯一身份与心跳租约，避免同一设备出现两个指挥者。</p></div><div><span>2</span><b>跨设备也保留负责人</b><p>通信可以接力，任务所有权只有接收方明确接受后才改变。</p></div><div><span>3</span><b>离线不会静默丢单</b><p>设备失联时保留最后心跳，并等待恢复或请主人重新分配。</p></div></div></div>;
}

function ApiView({ apiSummary }: { apiSummary: { status: 'checking' | 'online' | 'offline'; devices: number; agents: number } }) {
  const statusText = apiSummary.status === 'online' ? '接口在线' : apiSummary.status === 'checking' ? '正在检查' : '本地接口未响应';
  return <div className="workspace-view api-view"><div className="view-header"><div><span className="eyebrow">CONNECTOR API · V1</span><h1>接几个，接口都能接</h1><p>设备只需要注册一次，再用心跳和事件上报状态。核心房间不依赖固定的电脑数量。</p></div><span className={`api-status ${apiSummary.status}`}><i />{statusText}</span></div><div className="api-stats"><div><span>协议</span><b>murmur.v1</b></div><div><span>真实设备</span><b>{apiSummary.devices}</b></div><div><span>真实 Agent</span><b>{apiSummary.agents}</b></div><div><span>本机老大规则</span><b>1 / 设备</b></div></div><div className="model-switch-card"><div><span className="eyebrow">LOCAL MODEL CONTROL</span><h2>网页请求，Claw 执行</h2><p>网页只提交切换意图；4070 上的本地 Claw 读取待处理请求，真正切换模型后再回报 applied 或 failed。</p></div><div className="model-switch-flow"><span>选择模型</span><i>→</i><span>Claw 执行</span><i>→</i><span>确认结果</span></div></div><div className="endpoint-list"><ApiEndpoint method="GET" path="/api/v1/room" title="读取房间快照" detail="聊天室、设备、Agent、任务和审计事件的统一视图。" /><ApiEndpoint method="GET" path="/api/v1/models" title="读取本机模型目录" detail="Claw 注册实际可用模型后，网页可看到模型、当前选择和待处理切换请求。" /><ApiEndpoint method="POST" path="/api/v1/models/select" title="请求本地 Claw 切换模型" detail="网页发送 deviceId、agentId 和 modelId；这一步只创建 pending 请求，不假装已经切换。" /><ApiEndpoint method="POST" path="/api/v1/models/ack" title="确认模型已经切换" detail="Claw 本地执行成功后回报 applied；失败时回报 failed 和原因。" /><ApiEndpoint method="POST" path="/api/v1/connect" title="注册或重连设备" detail="传入一台设备和任意数量 Agent；服务会校验本机老大唯一性。" /><ApiEndpoint method="POST" path="/api/v1/heartbeat" title="上报心跳与趣味状态" detail="同步负载、当前工具、Token 摘要，以及“正在听歌 / 睡觉”等状态。" /><ApiEndpoint method="POST" path="/api/v1/messages" title="发送群聊消息" detail="支持 owner、agent、system 三种发送者和 @mentions。" /><ApiEndpoint method="POST" path="/api/v1/tasks" title="创建并自动接单" detail="可以指定 Agent，也可以按能力从在线 Agent 中自动选择。" /></div><div className="api-note"><span>↗</span><div><b>连接器只需要记住 4 件事</b><p>注册设备和模型目录 · 每 15–30 秒发心跳 · 轮询模型请求 · 切换完成后确认结果。当前接口默认使用内存 Store，后续接入持久化数据库时不需要改变这些路径。</p></div><code>Authorization: Bearer MURMUR_API_TOKEN</code></div></div>;
}

function ApiEndpoint({ method, path, title, detail }: { method: 'GET' | 'POST'; path: string; title: string; detail: string }) {
  return <article className="api-endpoint"><span className={`api-method ${method.toLowerCase()}`}>{method}</span><div><code>{path}</code><b>{title}</b><p>{detail}</p></div><span className="api-arrow">→</span></article>;
}

function ActivityView() {
  const events = [
    ['14:38:12', '循环防护', '系统阻止了 Lumi → Mochi 的重复委派', 'guard'],
    ['14:37:46', '进度更新', 'Lumi 完成了任务 #T-028 的规则复核', 'work'],
    ['14:36:08', '跨设备咨询', 'Nova 邀请 Lumi 协作，负责人仍为 Mochi', 'route'],
    ['14:34:51', '任务咨询', 'Mochi @Nova 验证跨设备通信', 'route'],
    ['14:33:20', '自动接单', 'Mochi 因能力匹配且负载较低接受任务 #T-028', 'claim'],
    ['14:32:58', '主人发布', `${OWNER_NAME} 创建任务 #T-028`, 'owner'],
    ['14:30:04', '设备心跳', '三台设备完成状态同步，7 个 Agent 在线', 'system'],
  ];
  return <div className="workspace-view activity-view"><div className="view-header"><div><span className="eyebrow">AUDIT STREAM</span><h1>他们在干什么，一眼可查</h1><p>这里只展示结构化进度和脱敏工具摘要，不展示密钥或 Agent 的隐藏思维过程。</p></div><button className="filter-button">全部事件⌄</button></div><div className="audit-summary"><span><b>42</b>今日事件</span><span><b>3</b>跨设备接力</span><span><b>1</b>循环已阻止</span><span><b>0</b>危险操作</span></div><div className="audit-list">{events.map(([time, label, text, tone]) => <article key={time}><time>{time}</time><span className={`audit-icon ${tone}`}>{tone === 'guard' ? '!' : tone === 'owner' ? '主' : '·'}</span><div><b>{label}</b><p>{text}</p></div><button>查看详情</button></article>)}</div><div className="privacy-note"><span>◉</span><p><b>可观察，但不泄密</b><br />工具名称、耗时、token 与产物可见；原始凭据、敏感参数和隐藏推理保持私密。</p></div></div>;
}
