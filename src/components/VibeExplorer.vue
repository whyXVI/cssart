<template>
  <div class="adhd-explorer" :class="`stage-${currentStage}`" :style="{ '--progress': timeProgress }">
    <header class="time-header">
      <div class="time-bar">
        <div class="objective-time" :data-text="formatTime(currentTime)">{{ formatTime(currentTime) }}</div>
      </div>
      <div class="cognitive-load">
        <div class="load-histogram">
          <div class="histogram-container">
            <!-- Empty slots for missing bars -->
            <div 
              v-for="i in (4 - loadHistory.length)" 
              :key="`empty-${i}`"
              class="histogram-bar empty"
            ></div>
            <!-- Actual bars -->
            <div 
              v-for="(item, index) in loadHistory" 
              :key="index"
              class="histogram-bar"
              :style="{ '--bar-index': index }"
            >
              <div class="bar-wrapper">
                <div class="bar-stack">
                  <div 
                    v-for="segment in getBarSegments(item)" 
                    :key="segment.type"
                    :class="['bar-segment', `segment-${segment.type}`]"
                    :style="{ height: `${segment.percentage}%` }"
                  ></div>
                </div>
                <div class="bar-time">{{ formatHistogramTime(item.time) }}</div>
              </div>
            </div>
          </div>
          <div class="histogram-axis">
            <span class="axis-label">Load</span>
          </div>
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
          <div :class="[
            'window-content',
            `${w.id}-content`,
            w.state && `${w.state}`
          ]"></div>
        </div>
      </section>

      <section class="concept-graph">
        <svg ref="graphSvg" class="graph-canvas" preserveAspectRatio="xMidYMid meet"></svg>
      </section>
    </main>

    <footer class="cognitive-console">
      <span class="concept-debt">Debt: {{ conceptDebt }}</span>
      <span class="subjective-flow">{{ subjectiveFlowText }}</span>
      <span class="cognitive-state">{{ cognitiveStateText }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'

type TimeStage = '2-4PM' | '4-6PM' | '6-8PM' | '8-10PM' | '10-12AM'
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
  '2-4PM': { duration: 550, decayRate: 0.02 },   // 50% of baseline
  '4-6PM': { duration: 600, decayRate: 0.03 },   // 75% of baseline
  '6-8PM': { duration: 600, decayRate: 0.04 },   // 100% baseline
  '8-10PM': { duration: 700, decayRate: 0.06 },  // 150% of baseline
  '10-12AM': { duration: 950, decayRate: 0.08 }  // 200% of baseline
}

const currentTime = ref(new Date(2024, 0, 1, 14, 0))
const currentStage = computed<TimeStage>(() => {
  const h = currentTime.value.getHours()
  if (h < 16) return '2-4PM'
  if (h < 18) return '4-6PM'
  if (h < 20) return '6-8PM'
  if (h < 22) return '8-10PM'
  return '10-12AM'
})

const subjectiveFlowText = computed(() => {
  // Calculate flow multiplier based on stage config
  const baselineDecay = 0.04 // 6-8PM baseline
  const currentDecay = stageConfigs[currentStage.value].decayRate
  const flowMultiplier = currentDecay / baselineDecay
  return `${flowMultiplier.toFixed(1)}x flow`
})

// Calculate time progress from 2PM to 11PM (0 to 1) based on hours only
const timeProgress = computed(() => {
  const hours = currentTime.value.getHours()
  // Map hours 14-23 (2PM-11PM) to 0-1
  // 2PM = 0, 3PM = 0.111, ... 11PM = 1
  if (hours < 14) return 1 // After midnight, stay at end
  const hoursSince2PM = hours - 14
  return Math.min(1, hoursSince2PM / 9) // 9 hours from 2PM to 11PM
})
const cognitiveLoad = ref(0) // Start with clear mind
const conceptDebt = ref(0)
const newGrayCount = ref(0)
const cognitiveState = ref<'exploring' | 'anxious' | 'overwhelmed' | 'collapsed'>('exploring')
const cognitiveStateText = computed(() => {
  const stateTexts = { exploring: 'vibing', anxious: 'anxious', overwhelmed: 'overwhelmed', collapsed: 'collapsed' }
  return stateTexts[cognitiveState.value]
})

// History data for scrolling histogram
interface LoadHistoryItem {
  time: Date
  conceptDebt: number
  redWeight: number      // redCount * 2
  lightBlueWeight: number // lightBlueCount * 1
  total: number
}
const loadHistory = ref<LoadHistoryItem[]>([])

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
let lastOperationWindow: string | null = null

const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const formatHistogramTime = (date: Date) => {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${period}`
}

/**
 * Adjust values to ensure minimum 20% proportion for visual presentation
 * If any component is below 20% of total, add +1 iteratively until all meet threshold
 */
const adjustForMinimumProportion = (conceptDebt: number, redWeight: number, lightBlueWeight: number) => {
  let debt = conceptDebt
  let red = redWeight
  let blue = lightBlueWeight
  
  const MIN_PROPORTION = 0.2
  let iterations = 0
  const MAX_ITERATIONS = 100 // Safety limit
  
  while (iterations < MAX_ITERATIONS) {
    const total = debt + red + blue
    if (total === 0) break
    
    const debtProp = debt / total
    const redProp = red / total
    const blueProp = blue / total
    
    // Check if all proportions meet minimum
    if (debtProp >= MIN_PROPORTION && redProp >= MIN_PROPORTION && blueProp >= MIN_PROPORTION) {
      break
    }
    
    // Add +1 to components below threshold
    if (debtProp < MIN_PROPORTION) debt += 1
    if (redProp < MIN_PROPORTION) red += 1
    if (blueProp < MIN_PROPORTION) blue += 1
    
    iterations++
  }
  
  return { debt, red, blue }
}

/**
 * Calculate bar segments with minimum 20% proportion
 * Returns array of segments with type and percentage for rendering
 */
const getBarSegments = (item: LoadHistoryItem) => {
  // Apply minimum proportion adjustment
  const adjusted = adjustForMinimumProportion(item.conceptDebt, item.redWeight, item.lightBlueWeight)
  const total = adjusted.debt + adjusted.red + adjusted.blue
  
  if (total === 0) {
    return [
      { type: 'debt', percentage: 33.33 },
      { type: 'red', percentage: 33.33 },
      { type: 'blue', percentage: 33.34 }
    ]
  }
  
  // Calculate percentages of the whole
  const debtPercent = (adjusted.debt / total) * 100
  const redPercent = (adjusted.red / total) * 100
  const bluePercent = (adjusted.blue / total) * 100
  
  // Scale total height based on load value (min 20%, max 90% of container)
  const minHeight = 20
  const maxHeight = 90
  const totalHeight = minHeight + (item.total / 100) * (maxHeight - minHeight)
  
  return [
    { type: 'debt', percentage: (debtPercent / 100) * totalHeight },
    { type: 'red', percentage: (redPercent / 100) * totalHeight },
    { type: 'blue', percentage: (bluePercent / 100) * totalHeight }
  ]
}

const recalcDebt = () => {
  conceptDebt.value = nodes.filter(n => n.state === 'red' || (n.state === 'lightBlue' && n.isTemporary)).length + newGrayCount.value
}

const cleanGray = () => {
  // Find gray nodes that don't have any non-gray neighbors
  const toRemove = nodes.filter(n => {
    if (n.state !== 'gray') return false
    
    // Check if this gray node has at least one non-gray neighbor
    const hasNonGrayNeighbor = links.some(l => {
      const s = typeof l.source === 'string' ? nodes.find(x => x.id === l.source) : l.source
      const t = typeof l.target === 'string' ? nodes.find(x => x.id === l.target) : l.target
      
      if (s === n && t && t.state !== 'gray') return true
      if (t === n && s && s.state !== 'gray') return true
      return false
    })
    
    return !hasNonGrayNeighbor
  })
  
  // Remove nodes and their connections
  toRemove.forEach(n => {
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

const getConnected = (node: ConceptNode, state?: NodeState): ConceptNode[] => {
  return links
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
}

const addNode = (parent?: ConceptNode, opts: Partial<ConceptNode> = {}): ConceptNode => {
  const angle = Math.random() * 2 * Math.PI
  const distance = 80 + Math.random() * 40
  const n: ConceptNode = {
    id: `n-${Date.now()}-${Math.random()}`,
    state: 'lightBlue',
    opacity: 0.8,
    size: 12,
    x: parent ? parent.x! + Math.cos(angle) * distance : 100 + Math.random() * 600,
    y: parent ? parent.y! + Math.sin(angle) * distance : 100 + Math.random() * 400,
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

/**
 * Calculate actual cognitive load (without time factor)
 * Formula: conceptDebt + redCount*2 + lightBlueCount*1
 * - conceptDebt already includes: red + temporary lightBlue + accumulated gray (newGrayCount)
 * - Additional red weight accounts for active attention demand
 * - Non-temporary lightBlue adds moderate load
 */
const calculateCognitiveLoad = (): number => {
  // Count nodes for additional weighting
  const redCount = nodes.filter(n => n.state === 'red').length
  const lightBlueCount = nodes.filter(n => n.state === 'lightBlue' && !n.isTemporary).length
  
  // Calculate components
  const redWeight = redCount * 2
  const lightBlueWeight = lightBlueCount * 1
  
  // Direct formula as specified
  const totalLoad = conceptDebt.value + redWeight + lightBlueWeight
  
  // Update history with normalized values
  const historyItem: LoadHistoryItem = {
    time: new Date(currentTime.value),
    conceptDebt: conceptDebt.value,
    redWeight,
    lightBlueWeight,
    total: Math.min(100, totalLoad)
  }
  
  // Add to history and keep only last 4 items
  loadHistory.value.push(historyItem)
  if (loadHistory.value.length > 4) {
    loadHistory.value.shift()
  }
  
  return Math.min(100, totalLoad)
}

/**
 * Dynamic decay based on cognitive load
 * - At load 0: nodes live 12 hours (decay = 0.015 per cycle)
 * - At load 100: nodes live 2 hours (decay = 0.1125 per cycle)
 * - Exponential interpolation between extremes
 * 
 * Key points on the curve:
 * - Load 0: 12h lifetime (slowest forgetting)
 * - Load 25: ~7.2h lifetime  
 * - Load 50: ~4.3h lifetime (moderate stress)
 * - Load 75: ~2.6h lifetime
 * - Load 100: 2h lifetime (fastest forgetting)
 */
const decay = () => {
  const load = cognitiveLoad.value
  
  // Base decay rates for different loads
  const MIN_DECAY = 0.015  // 12 hour lifetime
  const MAX_DECAY = 0.1125 // 2 hour lifetime
  
  // Global decay reduction factor
  const DECAY_REDUCTION = 0.8
  
  // Exponential interpolation
  const decayMultiplier = MIN_DECAY * Math.pow(MAX_DECAY / MIN_DECAY, load / 100)
  
  // Apply stage-specific modifier
  const stageModifier = stageConfigs[currentStage.value].decayRate / 0.04 // Normalized to mid-range
  const finalDecay = decayMultiplier * stageModifier * DECAY_REDUCTION
  
  nodes.forEach(n => {
    if (n.state !== 'gray') {
      // Apply additional 0.6x multiplier for blue nodes
      let nodeDecay = n.state === 'blue' ? finalDecay * 0.6 : finalDecay
      
      // Add ±10% random fluctuation
      const fluctuation = 0.9 + Math.random() * 0.2  // Random value between 0.9 and 1.1
      nodeDecay = nodeDecay * fluctuation
      
      n.opacity = Math.max(0, n.opacity - nodeDecay)
      if (n.opacity < 0.3) transitionNode(n, 'gray')
    }
  })
}

// Helper functions for ops
const getDistance = (from: ConceptNode, to: ConceptNode, maxDist: number): number => {
  if (from === to) return 0
  const visited = new Set<string>([from.id])
  const queue = [{ node: from, dist: 0 }]
  
  while (queue.length > 0) {
    const { node: current, dist } = queue.shift()!
    if (dist >= maxDist) continue
    
    const neighbors = getConnected(current)
    for (const neighbor of neighbors) {
      if (neighbor === to) return dist + 1
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id)
        queue.push({ node: neighbor, dist: dist + 1 })
      }
    }
  }
  return Infinity
}

const getNodesWithinDistance = (root: ConceptNode, maxDist: number, filterGray: boolean = true): ConceptNode[] => {
  const result: ConceptNode[] = []
  const visited = new Set<string>()
  const queue: { node: ConceptNode, dist: number }[] = [{ node: root, dist: 0 }]
  
  while (queue.length > 0) {
    const { node: current, dist } = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)
    
    if (dist <= maxDist && (!filterGray || current.state !== 'gray')) {
      result.push(current)
    }
    
    if (dist < maxDist) {
      getConnected(current).forEach(neighbor => {
        if (!visited.has(neighbor.id)) {
          queue.push({ node: neighbor, dist: dist + 1 })
        }
      })
    }
  }
  
  return result
}

const linkExists = (node1: ConceptNode, node2: ConceptNode): boolean => {
  return links.some(l => 
    (l.source === node1 && l.target === node2) ||
    (l.source === node2 && l.target === node1) ||
    ((l.source as ConceptNode).id === node1.id && (l.target as ConceptNode).id === node2.id) ||
    ((l.source as ConceptNode).id === node2.id && (l.target as ConceptNode).id === node1.id)
  )
}

const ops: Record<string, () => void> = {
  /**
   * browser-deep-reading:
   * 1. Convert a random red node to blue
   * 2. Process connected lightBlue nodes: 40% -> blue, 30% -> red, 30% -> stay
   * 3. Add 4-6 new nodes within distance 3 from root
   *    - Parent must be non-gray
   *    - New nodes: 30% gray, 40% lightBlue, 30% red
   *    - Each iteration recalculates available parents
   */
  'browser-deep-reading': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (!reds.length) return
    const root = reds[Math.floor(Math.random() * reds.length)]
    transitionNode(root, 'blue')
    
    getConnected(root, 'lightBlue').forEach(n => {
      const rand = Math.random()
      if (rand < 0.4) {
        transitionNode(n, 'blue')
      } else if (rand >= 0.7) {
        transitionNode(n, 'red')
      }
    })
    
    const nodesToAdd = 4 + Math.floor(Math.random() * 3)
    
    for (let i = 0; i < nodesToAdd; i++) {
      const nodesWithinDistance = getNodesWithinDistance(root, 3, true)
      if (nodesWithinDistance.length === 0) break
      
      const parent = nodesWithinDistance[Math.floor(Math.random() * nodesWithinDistance.length)]
      const rand = Math.random()
      let newNodeState: NodeState
      if (rand < 0.3) {
        newNodeState = 'gray'
      } else if (rand < 0.7) {
        newNodeState = 'lightBlue'
      } else {
        newNodeState = 'red'
      }
      addNode(parent, { state: newNodeState, opacity: 0.9 })
    }
  },
  
  /**
   * browser-info-hunger:
   * Creates 6-8 new nodes iteratively
   * - First node always connects to a random red node
   * - Subsequent nodes: 20% connect to red, 80% to newly generated nodes
   * - Node states: 30% gray, 30% lightBlue, 10% blue, 30% red
   * - Opacity range: 0.6-0.8
   */
  'browser-info-hunger': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (!reds.length) return
    const root = reds[Math.floor(Math.random() * reds.length)]
    
    const nodesToAdd = 6 + Math.floor(Math.random() * 3)
    const newNodes: ConceptNode[] = []
    
    for (let i = 0; i < nodesToAdd; i++) {
      let parent: ConceptNode
      
      if (i === 0) {
        parent = root
      } else {
        if (Math.random() < 0.2) {
          parent = root
        } else {
          parent = newNodes[Math.floor(Math.random() * newNodes.length)]
        }
      }
      
      const rand = Math.random()
      let nodeState: NodeState
      if (rand < 0.3) {
        nodeState = 'gray'
      } else if (rand < 0.6) {
        nodeState = 'lightBlue'
      } else if (rand < 0.7) {
        nodeState = 'blue'
      } else {
        nodeState = 'red'
      }
      
      const newNode = addNode(parent, { 
        state: nodeState, 
        opacity: 0.6 + Math.random() * 0.2 
      })
      newNodes.push(newNode)
    }
  },
  
  /**
   * chatgpt-generating:
   * Creates a new root node and 4-6 child nodes
   * - Root: 100% red (size: 15)
   * - Children: 40% lightBlue, 30% gray, 30% red
   */
  'chatgpt-generating': () => {
    const root = addNode(undefined, { state: 'red', opacity: 0.9, size: 15 })
    const numChildren = 4 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numChildren; i++) {
      addNode(root, { state: Math.random() > 0.6 ? 'lightBlue' : Math.random() > 0.3 ? 'gray' : 'red' })
    }
  },
  
  /**
   * chatgpt-explaining:
   * 1. Select 2-6 red nodes and convert to blue
   * 2. Connect them: chain connection + 25% chance for additional edges
   * 3. Convert connected gray nodes: 60% -> lightBlue, 40% -> red
   * 4. Add 2-4 new gray nodes positioned near center of blue nodes
   *    - Each gray connects to 2-3 blue nodes
   */
  'chatgpt-explaining': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (reds.length < 2) return
    
    const numToSelect = Math.min(reds.length, 2 + Math.floor(Math.random() * 5))
    const selectedReds: ConceptNode[] = []
    const redsCopy = [...reds]
    
    for (let i = 0; i < numToSelect; i++) {
      const idx = Math.floor(Math.random() * redsCopy.length)
      selectedReds.push(redsCopy[idx])
      redsCopy.splice(idx, 1)
    }
    
    selectedReds.forEach(node => transitionNode(node, 'blue'))
    
    for (let i = 0; i < selectedReds.length - 1; i++) {
      const source = selectedReds[i]
      const target = selectedReds[i + 1]
      if (!linkExists(source, target)) {
        links.push({ source, target, strength: 0.7 })
      }
    }
    
    for (let i = 0; i < selectedReds.length; i++) {
      for (let j = i + 2; j < selectedReds.length; j++) {
        if (Math.random() < 0.25) {
          const source = selectedReds[i]
          const target = selectedReds[j]
          if (!linkExists(source, target)) {
            links.push({ source, target, strength: 0.6 })
          }
        }
      }
    }
    
    selectedReds.forEach(blueNode => {
      getConnected(blueNode, 'gray').forEach(grayNode => {
        transitionNode(grayNode, Math.random() < 0.6 ? 'lightBlue' : 'red')
      })
    })
    
    const numGrayNodes = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numGrayNodes; i++) {
      const avgX = selectedReds.reduce((sum, n) => sum + (n.x || 0), 0) / selectedReds.length
      const avgY = selectedReds.reduce((sum, n) => sum + (n.y || 0), 0) / selectedReds.length
      
      const newGray: ConceptNode = {
        id: `n-${Date.now()}-${Math.random()}`,
        state: 'gray',
        opacity: 0.7,
        size: 10,
        x: avgX + (Math.random() - 0.5) * 150,
        y: avgY + (Math.random() - 0.5) * 150
      }
      nodes.push(newGray)
      
      const numConnections = 2 + Math.floor(Math.random() * 2)
      const blueNodesCopy = [...selectedReds]
      
      for (let j = 0; j < numConnections && blueNodesCopy.length > 0; j++) {
        const idx = Math.floor(Math.random() * blueNodesCopy.length)
        const targetBlue = blueNodesCopy[idx]
        links.push({ source: newGray, target: targetBlue, strength: 0.5 })
        blueNodesCopy.splice(idx, 1)
      }
    }
  },
  
  /**
   * obsidian-recording:
   * Convert up to 5 red nodes to temporary lightBlue
   * - Marks them as isTemporary = true
   * - Updates concept debt after conversion
   */
  'obsidian-recording': () => {
    nodes.filter(n => n.state === 'red').slice(0, 5).forEach(t => {
      t.state = 'lightBlue'
      t.isTemporary = true
    })
    recalcDebt()
  },
  
  /**
   * obsidian-organizing:
   * Complex probability-based organization of red nodes
   * 1. Select 2-6 red nodes
   * 2. Calculate base probability: e^(-cognitiveLoad/50)
   * 3. Calculate neighbor weights based on distance and color
   *    - Distance weights: 3 (dist=1), 1 (dist=2)
   *    - Color coefficients: red=0, gray=-1, lightBlue=-0.5, blue=1.5
   * 4. Probability modifier: 1/3 to 3x based on normalized score
   * 5. Success effects:
   *    - Red -> Blue conversion
   *    - Gray nodes with weight>=3 -> lightBlue
   *    - Opacity refresh for nearby nodes
   * 6. Failure effects:
   *    - Opacity averaging
   *    - 30% red -> lightBlue
   */
  'obsidian-organizing': () => {
    const reds = nodes.filter(n => n.state === 'red')
    if (reds.length === 0) return
    
    const numToSelect = reds.length < 2 ? reds.length : Math.min(reds.length, 2 + Math.floor(Math.random() * 5))
    const selectedReds: ConceptNode[] = []
    const redsCopy = [...reds]
    
    for (let i = 0; i < numToSelect; i++) {
      const idx = Math.floor(Math.random() * redsCopy.length)
      selectedReds.push(redsCopy[idx])
      redsCopy.splice(idx, 1)
    }
    
    const baseProbability = Math.exp(-cognitiveLoad.value / 50)
    const neighborScores = new Map<string, { weight: number, node: ConceptNode }>()
    
    selectedReds.forEach(redNode => {
      nodes.forEach(neighbor => {
        if (selectedReds.includes(neighbor)) return
        const dist = getDistance(redNode, neighbor, 2)
        if (dist <= 2) {
          const distWeight = dist === 1 ? 3 : dist === 2 ? 1 : 0
          if (!neighborScores.has(neighbor.id)) {
            neighborScores.set(neighbor.id, { weight: 0, node: neighbor })
          }
          neighborScores.get(neighbor.id)!.weight += distWeight
        }
      })
    })
    
    const colorCoefficients: Record<NodeState, number> = {
      red: 0,
      gray: -1,
      lightBlue: -0.5,
      blue: 1.5
    }
    
    let totalScore = 0
    neighborScores.forEach(({ weight, node }) => {
      const colorCoeff = colorCoefficients[node.state]
      totalScore += weight * colorCoeff
    })
    
    const SENSITIVITY = 0.1
    const MAX_NEIGHBORS = selectedReds.length * 6
    const normalizedScore = totalScore / (MAX_NEIGHBORS * 1.5)
    const modifier = Math.exp(SENSITIVITY * normalizedScore * Math.log(3))
    const clampedModifier = Math.max(1/3, Math.min(3, modifier))
    const finalProbability = Math.min(1, baseProbability * clampedModifier)
    
    const checkConnectivity = (): boolean => {
      for (let i = 0; i < selectedReds.length; i++) {
        for (let j = i + 1; j < selectedReds.length; j++) {
          const dist = getDistance(selectedReds[i], selectedReds[j], 4)
          if (dist >= 4) return false
        }
      }
      return true
    }
    
    if (Math.random() < finalProbability && checkConnectivity()) {
      selectedReds.forEach(n => transitionNode(n, 'blue'))
      
      for (let i = 0; i < selectedReds.length - 1; i++) {
        const dist = getDistance(selectedReds[i], selectedReds[i + 1], 4)
        if (dist > 1 && !linkExists(selectedReds[i], selectedReds[i + 1])) {
          links.push({ source: selectedReds[i], target: selectedReds[i + 1], strength: 0.5 })
        }
      }
      
      neighborScores.forEach(({ weight, node }) => {
        if (node.state === 'gray' && weight >= 3) {
          transitionNode(node, 'lightBlue')
        }
      })
      
      const allReds = nodes.filter(n => n.state === 'red' || selectedReds.includes(n))
      const opacityUpdates = new Map<string, { opacity: number, priority: number }>()
      
      allReds.forEach(redNode => {
        getConnected(redNode).forEach(neighbor => {
          if (neighbor.state === 'lightBlue' || neighbor.state === 'blue' || neighbor.state === 'red') {
            const current = opacityUpdates.get(neighbor.id)
            const currentOpacity = neighbor.opacity
            const newOpacity = currentOpacity + (0.9 - currentOpacity) * 2/3
            if (!current || current.priority < 2) {
              opacityUpdates.set(neighbor.id, { opacity: newOpacity, priority: 2 })
            }
          }
        })
        
        nodes.forEach(node => {
          if (node === redNode) return
          const dist = getDistance(redNode, node, 2)
          if (dist === 2 && (node.state === 'lightBlue' || node.state === 'blue' || node.state === 'red')) {
            const current = opacityUpdates.get(node.id)
            if (!current || current.priority < 1) {
              const currentOpacity = node.opacity
              const newOpacity = currentOpacity + (0.9 - currentOpacity) * 1/3
              opacityUpdates.set(node.id, { opacity: newOpacity, priority: 1 })
            }
          }
        })
      })
      
      opacityUpdates.forEach(({ opacity }, nodeId) => {
        const node = nodes.find(n => n.id === nodeId)
        if (node) node.opacity = Math.min(0.9, opacity)
      })
      
      selectedReds.forEach(n => n.opacity = 0.9)
      
    } else {
      selectedReds.forEach(n => {
        n.opacity = (n.opacity + 0.9) / 2
      })
      
      const toConvert = Math.floor(selectedReds.length * 0.3)
      for (let i = 0; i < toConvert; i++) {
        transitionNode(selectedReds[i], 'lightBlue')
      }
      
      windows.value[2].state = 'overwhelmed'
      setTimeout(() => windows.value[2].state = 'idle', 1000)
    }
  }
}

const getOperationMultiplier = (op: string, cognitiveLoad: number): number => {
  const load = Math.min(100, Math.max(0, cognitiveLoad))
  
  switch(op) {
    case 'browser-deep-reading':
    case 'browser-info-hunger':
      // Peak at 20-45, baseline at 0, minimum at 70+
      if (load <= 20) return 1.0 + (load / 20) * 1.0  // 1.0 to 2.0
      if (load <= 45) return 2.0                       // Stay at 2.0
      if (load <= 70) return 2.0 - ((load - 45) / 25) * 1.5  // 2.0 to 0.5
      return 0.5  // Minimum threshold
      
    case 'chatgpt-generating':
      // Linear decrease from 2.0 to 0.5 over 0-70
      if (load <= 70) return 2.0 - (load / 70) * 1.5
      return 0.5  // Minimum threshold
      
    case 'chatgpt-explaining':
    case 'obsidian-recording':
      // Always baseline
      return 1.0
      
    case 'obsidian-organizing':
      // Baseline at 0, peak at 45-70, baseline at 100
      if (load <= 45) return 1.0 + (load / 45) * 1.0  // 1.0 to 2.0
      if (load <= 70) return 2.0                       // Stay at 2.0
      return 2.0 - ((load - 70) / 30) * 1.0           // 2.0 to 1.0
      
    default:
      return 1.0
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
  cognitiveLoad.value = calculateCognitiveLoad()
}

const runAnimation = () => {
  if (!nodes.filter(n => n.state === 'red').length && nodes.length < 30) {
    addNode(undefined, { state: 'red', opacity: 0.9, size: 15 })
  }
  
  // Reset all windows
  windows.value.forEach(w => { w.active = false })
  
  // Count red nodes for availability check
  const redCount = nodes.filter(n => n.state === 'red').length
  const currentHour = currentTime.value.getHours()
  
  // Define available operations based on red node count
  const availableOps: { windowIdx: number, state: WindowState }[] = []
  
  // ChatGPT generating is always available
  availableOps.push({ windowIdx: 1, state: 'generating' })
  
  if (redCount > 0) {
    // Browser operations need at least 1 red node
    availableOps.push({ windowIdx: 0, state: 'deep-reading' })
    availableOps.push({ windowIdx: 0, state: 'info-hunger' })
    
    // ChatGPT explaining needs at least 2 red nodes
    if (redCount >= 2) {
      availableOps.push({ windowIdx: 1, state: 'explaining' })
    }
    
    // Obsidian organizing needs at least 3 red nodes
    if (redCount >= 3) {
      availableOps.push({ windowIdx: 2, state: 'organizing' })
    }
    
    // Obsidian recording needs at least 5 red nodes AND not after 11PM
    if (redCount >= 5 && (currentHour < 23 && currentHour >= 2)) {
      availableOps.push({ windowIdx: 2, state: 'recording' })
    }
  }
  
  // Calculate probabilities with multipliers
  const opsWithProbabilities = availableOps.map(op => {
    const opKey = `${windows.value[op.windowIdx].id}-${op.state}`
    let multiplier = getOperationMultiplier(opKey, cognitiveLoad.value)
    
    // Apply ChatGPT continuation bonus if last was ChatGPT and load > 70
    if (lastOperationWindow === 'chatgpt' && cognitiveLoad.value > 70 && windows.value[op.windowIdx].id === 'chatgpt') {
      multiplier *= 1.5
    }
    
    return {
      ...op,
      probability: multiplier
    }
  })
  
  // Normalize probabilities and select
  const totalProbability = opsWithProbabilities.reduce((sum, op) => sum + op.probability, 0)
  const random = Math.random() * totalProbability
  
  let cumulative = 0
  let selected = opsWithProbabilities[0]
  for (const op of opsWithProbabilities) {
    cumulative += op.probability
    if (random <= cumulative) {
      selected = op
      break
    }
  }
  
  // Apply selection
  windows.value[selected.windowIdx].active = true
  windows.value[selected.windowIdx].state = selected.state
  
  // Track last operation for continuation bonus
  lastOperationWindow = windows.value[selected.windowIdx].id
  
  executeOp()
  decay()
  
  // Use actual cognitive load for state determination
  const actualLoad = cognitiveLoad.value
  
  cognitiveState.value = actualLoad > 70 ? 'collapsed' : 
    actualLoad > 45 ? 'overwhelmed' : actualLoad > 20 ? 'anxious' : 'exploring'
  
  currentTime.value = new Date(currentTime.value.getTime() + 900000)
  
  if (currentTime.value.getHours() === 23) {
    nodes.forEach(n => { 
      if (n.isTemporary) { 
        n.state = 'red'
        n.isTemporary = false
      }
    })
    recalcDebt()
    updateSim()
  }
  
  if (currentTime.value.getHours() === 0 || currentTime.value.getHours() < 14) {
    reset()
    return
  }
  
  setTimeout(() => {
    windows.value.forEach(w => { 
      w.active = false
      w.state = 'idle'
    })
  }, stageConfigs[currentStage.value].duration - 500)
  
  animationTimer = setTimeout(runAnimation, stageConfigs[currentStage.value].duration)
}

const reset = () => {
  currentTime.value = new Date(2024, 0, 1, 14, 0)
  cognitiveLoad.value = 0
  conceptDebt.value = 0
  newGrayCount.value = 0
  cognitiveState.value = 'exploring'
  lastOperationWindow = null  // Reset last operation tracking
  windows.value.forEach(w => { 
    w.active = false
    w.state = 'idle'
  })
  nodes = [{ id: '1', state: 'red', opacity: 1, size: 20, x: 400, y: 300 }]
  links = []
  loadHistory.value = [] // Clear history on reset
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
    .force('charge', d3.forceManyBody().strength(-200).distanceMax(300))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force('collide', d3.forceCollide<ConceptNode>().radius(d => d.size + 20).strength(1.0).iterations(3))
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

onMounted(() => { 
  initD3()
  setTimeout(runAnimation, 1000)
})
onUnmounted(() => { 
  if (animationTimer) clearTimeout(animationTimer)
  if (simulation) simulation.stop()
})
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
    --glitch-intensity: 0.1;
  }
  
  &.stage-4-6PM {
    --primary: #ee5a24;
    --secondary: #00b894;
    --background: #f5f3f0;
    --text: #2d3436;
    --text-muted: #74797d;
    --saturation: 90%;
    --brightness: 95%;
    --glitch-intensity: 0.2;
  }
  
  &.stage-6-8PM {
    --primary: #a29bfe;
    --secondary: #6c5ce7;
    --background: #dfe6e9;
    --text: #2d3436;
    --text-muted: #95a5a6;
    --saturation: 70%;
    --brightness: 85%;
    --glitch-intensity: 0.4;
    
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
    --glitch-intensity: 0.6;
    
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
    --glitch-intensity: 0.8;
    
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
  
  .time-header {
    display: flex;
    align-items: center;
    height: 80px;
    flex-shrink: 0;
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    overflow: visible;
    
    .time-bar {
      flex: 1;
      height: 100%;
      position: relative;
      padding: 0 1.5rem;
    
    .objective-time { 
      font-size: 1.5rem; 
      font-weight: 600; 
      color: var(--primary); 
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      position: absolute;
      left: 0;
      top: 0.5rem;
      // Start at left edge, move across the time bar width
      left: calc(1.5rem + var(--progress) * (100% - 3rem - 100px));
      // 1.5rem padding + progress * (width - both paddings - time display width)
      // No transition - immediate position change on hour
      white-space: nowrap;
      
      // Glitch effect
      text-shadow: 
        calc(2px * var(--glitch-intensity)) calc(2px * var(--glitch-intensity)) 0 #ff00ff,
        calc(-2px * var(--glitch-intensity)) calc(-2px * var(--glitch-intensity)) 0 #00ffff;
      animation: glitch-text 2s infinite;
      
      &::before,
      &::after {
        content: attr(data-text);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }
      
      &::before {
        animation: glitch-1 0.5s infinite;
        color: #ff00ff;
        z-index: -1;
        opacity: var(--glitch-intensity);
      }
      
      &::after {
        animation: glitch-2 0.5s infinite;
        color: #00ffff;
        z-index: -2;
        opacity: var(--glitch-intensity);
      }
    }
    }
    
    .cognitive-load {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
      padding: 0.5rem 1.5rem 1rem;
      flex-shrink: 0;
      overflow: visible;
      
      .load-histogram {
        position: relative;
        height: 60px;
        width: 280px;
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
        overflow: visible;
        
        // Axes container - draws both X and Y axis from same origin
        &::before {
          content: '';
          position: absolute;
          left: 25px;
          bottom: 0;
          right: 0;
          top: 0;
          border-left: 2px solid var(--text-muted);
          border-bottom: 2px solid var(--text-muted);
          opacity: 0.5;
          pointer-events: none;
        }
        
        // Grid background
        &::after {
          content: '';
          position: absolute;
          left: 25px;
          right: 0;
          top: 0;
          bottom: 0;
          background-image: 
            repeating-linear-gradient(0deg, 
              rgba(255,255,255,0.5) 0, 
              rgba(255,255,255,0.5) 1px, 
              transparent 1px, 
              transparent 10px),
            repeating-linear-gradient(90deg, 
              rgba(255,255,255,0.5) 0, 
              rgba(255,255,255,0.5) 1px, 
              transparent 1px, 
              transparent 10px);
          pointer-events: none;
        }
        
        .histogram-container {
          position: relative;
          margin-left: 30px;
          height: 100%;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding-bottom: 20px;
          
          .histogram-bar {
            width: 50px;
            height: 100%;
            position: relative;
            z-index: 10;
            
            &:not(.empty) {
              animation: slideIn 0.5s ease-out;
              animation-delay: calc(var(--bar-index) * 0.1s);
            }
            
            &.empty {
              opacity: 0;
            }
            
            .bar-wrapper {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-end;
              position: relative;
              
              .bar-stack {
                width: 40px;
                height: 100%;
                display: flex;
                flex-direction: column-reverse;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 0 10px rgba(0,0,0,0.2);
                overflow: hidden;
                position: relative;
                
                .bar-segment {
                  width: 100%;
                  transition: height 0.3s ease-out;
                  position: relative;
                  
                  &.segment-debt { 
                    background: #ff6b6b;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
                  }
                  &.segment-red { 
                    background: #ee5a24;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
                  }
                  &.segment-blue { 
                    background: #74c0fc;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
                  }
                  
                  // Add subtle separators between segments
                  &:not(:first-child)::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: rgba(0,0,0,0.3);
                  }
                }
              }
              
              .bar-time {
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 0.55rem;
                color: var(--text-muted);
                font-weight: 500;
                letter-spacing: -0.25px;
                z-index: 1;
              }
            }
          }
        }
        
        .histogram-axis {
          position: absolute;
          left: 0;
          top: 40%;
          transform: translateY(-50%);
          writing-mode: vertical-rl;
          text-orientation: mixed;
          
          .axis-label {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
        }
      }
    }
  }
  
  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1rem;
    padding: 0;
    overflow: hidden;
    min-height: 0;
    
    .windows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  overflow-y: auto;
  
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
    
    &.active {
      background: rgba(255,255,255,0.08);
      h3 { color: var(--primary); }
    }
    
    // 状态样式
    &.state-deep-reading { border-color: #3498db; box-shadow: 0 0 20px rgba(52,152,219,0.3); }
    &.state-info-hunger { border-color: #e67e22; box-shadow: 0 0 20px rgba(230,126,34,0.3); }
    &.state-generating { border-color: #27ae60; box-shadow: 0 0 20px rgba(39,174,96,0.3); }
    &.state-explaining { border-color: #3498db; box-shadow: 0 0 20px rgba(52,152,219,0.3); }
    &.state-recording { border-color: #f1c40f; box-shadow: 0 0 20px rgba(241,196,15,0.3); }
    &.state-organizing { border-color: #9b59b6; box-shadow: 0 0 20px rgba(155,89,182,0.3); }
    &.state-overwhelmed { 
      border-color: #e74c3c; 
      box-shadow: 0 0 30px rgba(231,76,60,0.5); 
      animation: shake $anim-shake; 
    }

  }
  
  .window-content { 
    height: calc(100% - 2rem); 
    opacity: 1;
    position: relative;
    
    &.obsidian-content {
      &.recording {
        // 整个内容区域的样式
        background: rgba(241,196,15,0.05);  // 可选：淡黄色背景
        
        &::after {
          content: '⏺';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 2rem;
          color: #f1c40f;
          animation: record-pulse 1s ease-in-out infinite;
        }
      }
    }
  }
}
    
      
    }
    
    .concept-graph {
      background: rgba(0,0,0,0.03);
      border-radius: 8px;
      padding: 1rem;
      overflow: hidden;
      position: relative;
      min-height: 0;
      
      .graph-canvas {
        width: 100%;
        height: 100%;
        display: block;
        
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
    padding: 0.75rem 1.5rem;
    height: 50px;
    flex-shrink: 0;
    background: rgba(0,0,0,0.08);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255,255,255,0.1);
    
    .concept-debt { 
      color: var(--primary); 
      font-weight: 600; 
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .subjective-flow { 
      font-size: 0.95rem; 
      color: var(--text-muted); 
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-weight: 500;
    }
    .cognitive-state { 
      color: var(--text-muted); 
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-weight: 500;
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

@keyframes record-pulse {
                0%, 100% {
                    // translate(-50%, -50%) 保持居中
                    // scale(1) 正常大小
                    transform: translate(-50%, -50%) scale(1);
                }
                50% {
                    // translate(-50%, -50%) 继续保持居中
                    // scale(1.2) 放大20%
                    transform: translate(-50%, -50%) scale(1.2);
                }
            }

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes glitch-text {
  0%, 100% { text-shadow: calc(2px * var(--glitch-intensity)) calc(2px * var(--glitch-intensity)) 0 #ff00ff, calc(-2px * var(--glitch-intensity)) calc(-2px * var(--glitch-intensity)) 0 #00ffff; }
  20% { text-shadow: calc(2px * var(--glitch-intensity)) calc(2px * var(--glitch-intensity)) 0 #00ffff, calc(-2px * var(--glitch-intensity)) calc(-2px * var(--glitch-intensity)) 0 #ff00ff; }
  40% { text-shadow: calc(-2px * var(--glitch-intensity)) calc(2px * var(--glitch-intensity)) 0 #ff00ff, calc(2px * var(--glitch-intensity)) calc(-2px * var(--glitch-intensity)) 0 #00ffff; }
}

@keyframes glitch-1 {
  0%, 100% { clip-path: inset(0 0 100% 0); transform: translateX(0); }
  20% { clip-path: inset(20% 0 60% 0); transform: translateX(calc(-2px * var(--glitch-intensity))); }
  40% { clip-path: inset(40% 0 20% 0); transform: translateX(calc(2px * var(--glitch-intensity))); }
  60% { clip-path: inset(80% 0 0 0); transform: translateX(calc(1px * var(--glitch-intensity))); }
}

@keyframes glitch-2 {
  0%, 100% { clip-path: inset(100% 0 0 0); transform: translateX(0); }
  20% { clip-path: inset(60% 0 20% 0); transform: translateX(calc(2px * var(--glitch-intensity))); }
  40% { clip-path: inset(20% 0 40% 0); transform: translateX(calc(-2px * var(--glitch-intensity))); }
  60% { clip-path: inset(0 0 80% 0); transform: translateX(calc(-1px * var(--glitch-intensity))); }
}
</style>