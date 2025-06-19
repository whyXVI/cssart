<template>
  <div class="adhd-explorer" :class="`stage-${currentStage}`">
    <header class="time-bar">
      <div class="objective-time">{{ formatTime(currentTime) }}</div>
      <div class="subjective-flow">{{ subjectiveFlowText }}</div>
      <div class="cognitive-load">
        <span>认知负荷</span>
        <div class="load-bar-container">
          <div class="load-bar" :style="{ '--load-percentage': `${cognitiveLoad}%` }"></div>
        </div>
      </div>
    </header>

    <main class="workspace">
      <section class="windows">
        <div 
          v-for="w in windows" 
          :key="w.id"
          :class="['window', `window-${w.id}`, `state-${w.state}`, { active: w.active }]"
        >
          <h3>{{ w.title }}</h3>
          <div class="window-content"></div>
        </div>
      </section>

      <section class="concept-graph">
        <svg ref="graphSvg" class="graph-canvas"></svg>
      </section>
    </main>

    <footer class="cognitive-console">
      <span class="concept-debt">概念债: {{ conceptDebt }}</span>
      <span class="cognitive-state">{{ cognitiveStateText }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'

type TimeStage = '2-4PM' | '4-6PM' | '6-8PM' | '8-10PM' | '10-12AM'
type SubjectiveFlow = 'Normal' | 'Hyperfocus' | 'Switching'
type WindowState = 'idle' | 'deep-reading' | 'info-hunger' | 'generating' | 'explaining' | 'recording' | 'organizing' | 'overwhelmed'
type NodeState = 'red' | 'lightBlue' | 'blue' | 'gray'

interface Window {
  id: 'browser' | 'chatgpt' | 'obsidian'
  title: string
  active: boolean
  state: WindowState
}

interface ConceptNode extends d3.SimulationNodeDatum {
  id: string
  state: NodeState
  opacity: number
  isTemporary?: boolean
  size: number
}

interface ConceptLink extends d3.SimulationLinkDatum<ConceptNode> {
  source: ConceptNode | string
  target: ConceptNode | string
  strength: number
}

const stageConfigs = {
  '2-4PM': { duration: 600, decayRate: 0.02 },
  '4-6PM': { duration: 600, decayRate: 0.03 },
  '6-8PM': { duration: 600, decayRate: 0.04 },
  '8-10PM': { duration: 700, decayRate: 0.06 },
  '10-12AM': { duration: 900, decayRate: 0.08 }
}

const flowTexts = { 'Normal': '正常流速', 'Hyperfocus': '专注缓慢', 'Switching': '切换混乱' }
const stateTexts = { 'exploring': '探索中', 'anxious': '焦虑累积', 'overwhelmed': '任务陷入', 'collapsed': '认知崩溃' }

const currentTime = ref(new Date(2024, 0, 1, 14, 0))
const currentStage = computed<TimeStage>(() => {
  const h = currentTime.value.getHours()
  if (h < 16) return '2-4PM'
  if (h < 18) return '4-6PM'
  if (h < 20) return '6-8PM'
  if (h < 22) return '8-10PM'
  return '10-12AM'
})

const subjectiveFlow = ref<SubjectiveFlow>('Normal')
const subjectiveFlowText = computed(() => flowTexts[subjectiveFlow.value])
const cognitiveLoad = ref(10)
const conceptDebt = ref(0)
const newGrayCount = ref(0)
const cognitiveState = ref<'exploring' | 'anxious' | 'overwhelmed' | 'collapsed'>('exploring')
const cognitiveStateText = computed(() => stateTexts[cognitiveState.value])

const windows = ref<Window[]>([
  { id: 'browser', title: 'Browser', active: false, state: 'idle' },
  { id: 'chatgpt', title: 'ChatGPT', active: false, state: 'idle' },
  { id: 'obsidian', title: 'Obsidian', active: false, state: 'idle' }
])

const graphSvg = ref<SVGSVGElement>()
let simulation: d3.Simulation<ConceptNode, ConceptLink> | null = null
let nodes: ConceptNode[] = []
let links: ConceptLink[] = []
let animationTimer: ReturnType<typeof setTimeout> | null = null

const formatTime = (date: Date) => 
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

const recalcDebt = () => {
  conceptDebt.value = nodes.filter(n => n.state === 'red' || (n.state === 'lightBlue' && n.isTemporary)).length + newGrayCount.value
}

const cleanGray = () => {
  const isolated = nodes.filter(n => 
    n.state === 'gray' && !links.some(l => {
      const s = typeof l.source === 'string' ? nodes.find(x => x.id === l.source) : l.source
      const t = typeof l.target === 'string' ? nodes.find(x => x.id === l.target) : l.target
      return ((s === n && t?.state !== 'gray') || (t === n && s?.state !== 'gray'))
    })
  )
  
  isolated.forEach(n => {
    nodes.splice(nodes.indexOf(n), 1)
    links = links.filter(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      return s !== n.id && t !== n.id
    })
  })
}

const transitionNode = (node: ConceptNode, newState: NodeState) => {
  const oldState = node.state
  node.state = newState
  if (oldState !== 'gray' && newState === 'gray') {
    newGrayCount.value++
  } else if (oldState === 'gray' && newState !== 'gray') {
    newGrayCount.value = Math.max(0, newGrayCount.value - 1)
  }
  if (node.isTemporary && newState !== 'lightBlue') node.isTemporary = false
  recalcDebt()
}

const getConnected = (node: ConceptNode, state?: NodeState): ConceptNode[] =>
  links
    .filter(l => {
      const s = typeof l.source === 'string' ? nodes.find(n => n.id === l.source) : l.source
      const t = typeof l.target === 'string' ? nodes.find(n => n.id === l.target) : l.target
      return s === node || t === node
    })
    .map(l => {
      const s = typeof l.source === 'string' ? nodes.find(n => n.id === l.source) : l.source
      const t = typeof l.target === 'string' ? nodes.find(n => n.id === l.target) : l.target
      return (s === node ? t : s) as ConceptNode
    })
    .filter(n => n && (!state || n.state === state))

const addNode = (parent?: ConceptNode, opts: Partial<ConceptNode> = {}): ConceptNode => {
  const n: ConceptNode = {
    id: `n-${Date.now()}-${Math.random()}`,
    state: 'lightBlue',
    opacity: 0.8,
    size: 12,
    x: parent ? parent.x! + (Math.random() - 0.5) * 100 : 100 + Math.random() * 600,
    y: parent ? parent.y! + (Math.random() - 0.5) * 100 : 100 + Math.random() * 400,
    ...opts
  }
  nodes.push(n)
  if (parent) links.push({ source: parent, target: n, strength: 0.6 })
  if (n.state === 'red') conceptDebt.value++
  return n
}

const updateSim = () => {
  if (!simulation) return
  cleanGray()
  simulation.nodes(nodes)
  const linkForce = simulation.force('link') as d3.ForceLink<ConceptNode, ConceptLink>
  linkForce.links(links)
  simulation.alpha(1).restart()
  for (let i = 0; i < 1000; i++) simulation.tick()
}

const decay = () => {
  const rate = stageConfigs[currentStage.value].decayRate
  nodes.forEach(n => {
    if (n.state !== 'gray') {
      n.opacity = Math.max(0, n.opacity - rate)
      if (n.opacity < 0.3) transitionNode(n, 'gray')
    }
  })
}

const ops: Record<string, () => void> = {
  'browser-deep-reading': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (!reds.length) return
    const t = reds[Math.floor(Math.random() * reds.length)]
    transitionNode(t, 'blue')
    getConnected(t, 'lightBlue').forEach(n => transitionNode(n, 'blue'))
    if (Math.random() < 0.2) {
      const blues = nodes.filter(n => n.state === 'blue')
      if (blues.length) transitionNode(blues[Math.floor(Math.random() * blues.length)], 'red')
    }
    addNode(t, { state: Math.random() > 0.5 ? 'lightBlue' : 'gray', opacity: 0.9 })
  },
  
  'browser-info-hunger': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (!reds.length) return
    const root = reds[Math.floor(Math.random() * reds.length)]
    for (let i = 0; i < 3 + Math.random() * 3; i++) {
      addNode(root, { state: Math.random() > 0.3 ? 'lightBlue' : 'gray', opacity: 0.6 + Math.random() * 0.2 })
    }
  },
  
  'chatgpt-generating': () => {
    const root = addNode(undefined, { state: Math.random() > 0.5 ? 'red' : 'lightBlue', opacity: 0.9, size: 15 })
    for (let i = 0; i < 2 + Math.random() * 3; i++) {
      addNode(root, { state: Math.random() > 0.6 ? 'lightBlue' : Math.random() > 0.3 ? 'gray' : 'red' })
    }
  },
  
  'chatgpt-explaining': () => {
    const reds = nodes.filter(n => n.state === 'red').slice(0, 3)
    reds.forEach(t => {
      transitionNode(t, 'blue')
      getConnected(t, 'gray').forEach(n => transitionNode(n, Math.random() > 0.5 ? 'lightBlue' : 'red'))
    })
  },
  
  'obsidian-recording': () => {
    nodes.filter(n => n.state === 'red').slice(0, 5).forEach(t => {
      t.state = 'lightBlue'
      t.isTemporary = true
    })
    recalcDebt()
  },
  
  'obsidian-organizing': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (Math.random() < 1 - cognitiveLoad.value / 100) {
      reds.forEach(n => transitionNode(n, 'blue'))
    } else {
      reds.slice(0, Math.floor(reds.length * 0.3)).forEach(n => transitionNode(n, 'lightBlue'))
      windows.value[2].state = 'overwhelmed'
      setTimeout(() => windows.value[2].state = 'idle', 1000)
    }
  }
}

const executeOp = () => {
  const w = windows.value.find(w => w.active)
  if (!w) return
  const key = `${w.id}-${w.state}`
  const op = ops[key]
  if (op) {
    op()
    recalcDebt()
    updateSim()
  }
  cognitiveLoad.value = Math.min(100, nodes.length * 0.5 + conceptDebt.value * 2 + (currentTime.value.getHours() - 14) * 5)
}

const runAnimation = () => {
  if (!nodes.filter(n => n.state === 'red').length && nodes.length < 30) {
    addNode(undefined, { state: 'red', opacity: 0.9, size: 15 })
  }
  
  windows.value.forEach(w => w.active = false)
  const idx = Math.floor(Math.random() * 3)
  windows.value[idx].active = true
  
  const states = [['deep-reading', 'info-hunger'], ['generating', 'explaining'], ['recording', 'organizing']]
  windows.value[idx].state = states[idx][Math.floor(Math.random() * states[idx].length)] as WindowState
  
  executeOp()
  decay()
  
  subjectiveFlow.value = cognitiveLoad.value > 70 ? 'Switching' : 
    windows.value.some(w => w.state === 'deep-reading' || w.state === 'explaining') ? 'Hyperfocus' : 'Normal'
  
  cognitiveState.value = cognitiveLoad.value > 80 ? 'collapsed' : 
    cognitiveLoad.value > 60 ? 'overwhelmed' : cognitiveLoad.value > 40 ? 'anxious' : 'exploring'
  
  currentTime.value = new Date(currentTime.value.getTime() + 900000)
  
  if (currentTime.value.getHours() === 23) {
    nodes.forEach(n => { if (n.isTemporary) { n.state = 'red'; n.isTemporary = false } })
    recalcDebt()
    updateSim()
  }
  
  if (currentTime.value.getHours() === 0 || currentTime.value.getHours() < 14) {
    reset()
    return
  }
  
  setTimeout(() => windows.value.forEach(w => { w.active = false; w.state = 'idle' }), 
    stageConfigs[currentStage.value].duration - 500)
  
  animationTimer = setTimeout(runAnimation, stageConfigs[currentStage.value].duration)
}

const reset = () => {
  currentTime.value = new Date(2024, 0, 1, 14, 0)
  cognitiveLoad.value = 10
  conceptDebt.value = 0
  newGrayCount.value = 0
  cognitiveState.value = 'exploring'
  subjectiveFlow.value = 'Normal'
  windows.value.forEach(w => { w.active = false; w.state = 'idle' })
  nodes = [{ id: '1', state: 'red', opacity: 1, size: 20, x: 400, y: 300 }]
  links = []
  updateSim()
  runAnimation()
}

const initD3 = () => {
  if (!graphSvg.value) return
  
  const svg = d3.select(graphSvg.value)
  const width = 800, height = 600
  svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove()
  
  const g = svg.append('g')
  const linkGroup = g.append('g').attr('class', 'links')
  const nodeGroup = g.append('g').attr('class', 'nodes')
  
  nodes = [{ id: '1', state: 'red', opacity: 1, size: 20, x: width / 2, y: height / 2 }]
  links = []
  recalcDebt()
  
  simulation = d3.forceSimulation<ConceptNode>(nodes)
    .force('link', d3.forceLink<ConceptNode, ConceptLink>(links).id(d => d.id).distance(60).strength(d => d.strength * 0.8))
    .force('charge', d3.forceManyBody().strength(-120).distanceMax(200))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force('collide', d3.forceCollide<ConceptNode>().radius(d => d.size + 10).strength(0.8))
    .alphaDecay(0.02).velocityDecay(0.4)
  
  simulation.on('tick', () => {
    nodes.forEach(n => {
      n.x = Math.max(50, Math.min(width - 50, n.x!))
      n.y = Math.max(50, Math.min(height - 50, n.y!))
    })
    
    linkGroup.selectAll<SVGLineElement, ConceptLink>('.link')
      .data(links, (d: any) => `${(d.source as any).id}-${(d.target as any).id}`)
      .join('line')
      .attr('class', 'link')
      .attr('x1', d => (d.source as ConceptNode).x || 0)
      .attr('y1', d => (d.source as ConceptNode).y || 0)
      .attr('x2', d => (d.target as ConceptNode).x || 0)
      .attr('y2', d => (d.target as ConceptNode).y || 0)
      .attr('stroke-opacity', d => d.strength * 0.6)
    
    nodeGroup.selectAll<SVGCircleElement, ConceptNode>('.node')
      .data(nodes, d => d.id)
      .join(
        enter => enter.append('circle').attr('class', d => `node concept-node ${d.state} ${d.isTemporary ? 'temporary' : ''}`),
        update => update.attr('class', d => `node concept-node ${d.state} ${d.isTemporary ? 'temporary' : ''}`)
      )
      .attr('r', d => d.size)
      .attr('cx', d => d.x || 0)
      .attr('cy', d => d.y || 0)
      .attr('opacity', d => d.opacity)
  })
}

onMounted(() => { initD3(); setTimeout(runAnimation, 1000) })
onUnmounted(() => { if (animationTimer) clearTimeout(animationTimer); if (simulation) simulation.stop() })
</script>

<style scoped lang="scss">
$node-red: #ff6b6b;
$node-red-light: #ff9999;
$node-blue: #4ecdc4;
$node-blue-light: #7edcd6;
$node-lightblue: #74c0fc;
$node-lightblue-light: #a5d8ff;
$node-gray: #868e96;

$anim-tremor: 0.2s;
$anim-shake: 0.5s;
$anim-pulse: 2s;
$anim-noise: 0.5s;
$anim-transition: 0.5s;
$anim-node-transition: 0.3s;
$anim-window-transition: 0.05s;

.adhd-explorer {
  --transition-duration: #{$anim-transition};
  
  &.stage-2-4PM {
    --primary: #ff6b6b;
    --secondary: #4ecdc4;
    --background: #fef9ef;
    --text: #2d3436;
    --text-muted: #636e72;
    --saturation: 100%;
    --brightness: 100%;
  }
  
  &.stage-4-6PM {
    --primary: #ee5a24;
    --secondary: #00b894;
    --background: #f5f3f0;
    --text: #2d3436;
    --text-muted: #74797d;
    --saturation: 90%;
    --brightness: 95%;
  }
  
  &.stage-6-8PM {
    --primary: #a29bfe;
    --secondary: #6c5ce7;
    --background: #dfe6e9;
    --text: #2d3436;
    --text-muted: #95a5a6;
    --saturation: 70%;
    --brightness: 85%;
    
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle, transparent 60%, rgba(0,0,0,0.2));
      pointer-events: none;
    }
  }
  
  &.stage-8-10PM {
    --primary: #74b9ff;
    --secondary: #0984e3;
    --background: #b2bec3;
    --text: #2d3436;
    --text-muted: #636e72;
    --saturation: 50%;
    --brightness: 70%;
    
    .concept-node { animation: tremor $anim-tremor ease-in-out infinite; }
  }
  
  &.stage-10-12AM {
    --primary: #636e72;
    --secondary: #2d3436;
    --background: #2d3436;
    --text: #dfe6e9;
    --text-muted: #95a5a6;
    --saturation: 20%;
    --brightness: 40%;
    
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,.03) 2px, rgba(255,255,255,.03) 4px);
      pointer-events: none;
      opacity: 0.5;
      mix-blend-mode: overlay;
      animation: noise $anim-noise steps(4) infinite;
    }
  }
  
  width: 100%;
  height: 100vh;
  background: var(--background);
  color: var(--text);
  display: flex;
  flex-direction: column;
  transition: all var(--transition-duration);
  filter: saturate(var(--saturation)) brightness(var(--brightness));
  position: relative;
  overflow: hidden;
  
  .time-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    
    .objective-time { font-size: 1.8rem; font-weight: 600; color: var(--primary); }
    .subjective-flow { font-size: 1.1rem; color: var(--text-muted); font-style: italic; }
    
    .cognitive-load {
      display: flex;
      align-items: center;
      gap: 1rem;
      
      span { font-size: 0.9rem; color: var(--text-muted); }
      
      .load-bar-container {
        width: 200px;
        height: 8px;
        background: rgba(0,0,0,0.1);
        border-radius: 4px;
        overflow: hidden;
      }
      
      .load-bar {
        width: var(--load-percentage, 0%);
        height: 100%;
        background: linear-gradient(90deg, var(--secondary), var(--primary));
        transition: width $anim-transition;
      }
    }
  }
  
  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
    padding: 2rem;
    
    .windows {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      
      .window {
        flex: 1;
        background: rgba(255,255,255,0.03);
        border: 3px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 1rem;
        transition: all $anim-window-transition;
        position: relative;
        
        h3 {
          margin: 0 0 0.5rem;
          color: var(--text-muted);
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        
        .window-content { height: calc(100% - 2rem); opacity: 0; }
        
        &.active {
          background: rgba(255,255,255,0.08);
          h3 { color: var(--primary); }
        }
        
        &.state-deep-reading { border-color: #3498db; box-shadow: 0 0 20px rgba(52,152,219,0.3); }
        &.state-info-hunger { border-color: #e67e22; box-shadow: 0 0 20px rgba(230,126,34,0.3); }
        &.state-generating { border-color: #27ae60; box-shadow: 0 0 20px rgba(39,174,96,0.3); }
        &.state-explaining { border-color: #3498db; box-shadow: 0 0 20px rgba(52,152,219,0.3); }
        &.state-recording { border-color: #f1c40f; box-shadow: 0 0 20px rgba(241,196,15,0.3); }
        &.state-organizing { border-color: #9b59b6; box-shadow: 0 0 20px rgba(155,89,182,0.3); }
        &.state-overwhelmed { border-color: #e74c3c; box-shadow: 0 0 30px rgba(231,76,60,0.5); animation: shake $anim-shake; }
      }
    }
    
    .concept-graph {
      background: rgba(0,0,0,0.03);
      border-radius: 8px;
      padding: 1rem;
      
      .graph-canvas {
        width: 100%;
        height: 100%;
        
        :deep(.link) { stroke: var(--text-muted); stroke-width: 1.5; }
        
        :deep(.concept-node) {
          transition: all $anim-node-transition;
          
          &.red { fill: $node-red; filter: drop-shadow(0 0 10px $node-red-light); }
          &.blue { fill: $node-blue; filter: drop-shadow(0 0 8px $node-blue-light); }
          &.lightBlue { fill: $node-lightblue; filter: drop-shadow(0 0 6px $node-lightblue-light); }
          &.gray { fill: $node-gray; opacity: 0.3; }
          
          &.temporary {
            stroke: $node-red;
            stroke-width: 2;
            stroke-dasharray: 5,5;
            fill-opacity: 0.6;
            animation: pulse $anim-pulse ease-in-out infinite;
          }
        }
      }
    }
  }
  
  .cognitive-console {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3rem;
    padding: 1rem 2rem;
    background: rgba(0,0,0,0.08);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255,255,255,0.1);
    
    .concept-debt { color: var(--primary); font-weight: 600; }
    .cognitive-state { color: var(--text-muted); font-style: italic; }
  }
}

@keyframes tremor {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 1px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-1px, -1px); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

@keyframes noise {
  0%, 100% { opacity: 0.02; }
  50% { opacity: 0.05; }
}
</style>