<template>
  <div class="cloneable">
    <a
      ref="brandingEl"
      @mouseenter="() => handleMouseEnter(0)"
      @mouseleave="() => handleMouseLeave(0)"
      href="#"
      class="text-draw w-inline-block"
    >
      <p class="text-draw__p">Branding</p>
      <div ref="brandingBox" class="text-draw__box"></div>
    </a>
    
    <a
      ref="designEl"
      @mouseenter="() => handleMouseEnter(1)"
      @mouseleave="() => handleMouseLeave(1)"
      href="#"
      class="text-draw w-inline-block"
    >
      <p class="text-draw__p">Design</p>
      <div ref="designBox" class="text-draw__box"></div>
    </a>
    
    <a
      ref="developmentEl"
      @mouseenter="() => handleMouseEnter(2)"
      @mouseleave="() => handleMouseLeave(2)"
      href="#"
      class="text-draw w-inline-block"
    >
      <p class="text-draw__p">Development</p>
      <div ref="developmentBox" class="text-draw__box"></div>
    </a>
  </div>
  
  <div class="osmo-credits">
    <p class="osmo-credits__p">
      Resource by 
      <a 
        target="_blank" 
        href="https://www.osmo.supply?utm_source=codepen&utm_medium=pen&utm_campaign=draw-random-underline" 
        class="osmo-credits__p-a"
      >
        Osmo
      </a>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

// 注册GSAP插件
gsap.registerPlugin(DrawSVGPlugin)

// Template refs
const brandingEl = ref<HTMLElement>()
const brandingBox = ref<HTMLElement>()
const designEl = ref<HTMLElement>()
const designBox = ref<HTMLElement>()
const developmentEl = ref<HTMLElement>()
const developmentBox = ref<HTMLElement>()

// 状态管理
const nextIndex = ref<number | null>(null)
const enterTweens = ref<(gsap.core.Tween | null)[]>([null, null, null])
const leaveTweens = ref<(gsap.core.Tween | null)[]>([null, null, null])

// SVG变体数组
const svgVariants = [
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 20.9999C26.7762 16.2245 49.5532 11.5572 71.7979 14.6666C84.9553 16.5057 97.0392 21.8432 109.987 24.3888C116.413 25.6523 123.012 25.5143 129.042 22.6388C135.981 19.3303 142.586 15.1422 150.092 13.3333C156.799 11.7168 161.702 14.6225 167.887 16.8333C181.562 21.7212 194.975 22.6234 209.252 21.3888C224.678 20.0548 239.912 17.991 255.42 18.3055C272.027 18.6422 288.409 18.867 305 17.9999" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></svg>`,
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 24.2592C26.233 20.2879 47.7083 16.9968 69.135 13.8421C98.0469 9.5853 128.407 4.02322 158.059 5.14674C172.583 5.69708 187.686 8.66104 201.598 11.9696C207.232 13.3093 215.437 14.9471 220.137 18.3619C224.401 21.4596 220.737 25.6575 217.184 27.6168C208.309 32.5097 197.199 34.281 186.698 34.8486C183.159 35.0399 147.197 36.2657 155.105 26.5837C158.11 22.9053 162.993 20.6229 167.764 18.7924C178.386 14.7164 190.115 12.1115 201.624 10.3984C218.367 7.90626 235.528 7.06127 252.521 7.49276C258.455 7.64343 264.389 7.92791 270.295 8.41825C280.321 9.25056 296 10.8932 305 13.0242" stroke="#E55050" stroke-width="10" stroke-linecap="round"/></svg>`,
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 29.5014C9.61174 24.4515 12.9521 17.9873 20.9532 17.5292C23.7742 17.3676 27.0987 17.7897 29.6575 19.0014C33.2644 20.7093 35.6481 24.0004 39.4178 25.5014C48.3911 29.0744 55.7503 25.7731 63.3048 21.0292C67.9902 18.0869 73.7668 16.1366 79.3721 17.8903C85.1682 19.7036 88.2173 26.2464 94.4121 27.2514C102.584 28.5771 107.023 25.5064 113.276 20.6125C119.927 15.4067 128.83 12.3333 137.249 15.0014C141.418 16.3225 143.116 18.7528 146.581 21.0014C149.621 22.9736 152.78 23.6197 156.284 24.2514C165.142 25.8479 172.315 17.5185 179.144 13.5014C184.459 10.3746 191.785 8.74853 195.868 14.5292C199.252 19.3205 205.597 22.9057 211.621 22.5014C215.553 22.2374 220.183 17.8356 222.979 15.5569C225.4 13.5845 227.457 11.1105 230.742 10.5292C232.718 10.1794 234.784 12.9691 236.164 14.0014C238.543 15.7801 240.717 18.4775 243.356 19.8903C249.488 23.1729 255.706 21.2551 261.079 18.0014C266.571 14.6754 270.439 11.5202 277.146 13.6125C280.725 14.7289 283.221 17.209 286.393 19.0014C292.321 22.3517 298.255 22.5014 305 22.5014" stroke="#E55050" stroke-width="10" stroke-linecap="round"/></svg>`,
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.0039 32.6826C32.2307 32.8412 47.4552 32.8277 62.676 32.8118C67.3044 32.807 96.546 33.0555 104.728 32.0775C113.615 31.0152 104.516 28.3028 102.022 27.2826C89.9573 22.3465 77.3751 19.0254 65.0451 15.0552C57.8987 12.7542 37.2813 8.49399 44.2314 6.10216C50.9667 3.78422 64.2873 5.81914 70.4249 5.96641C105.866 6.81677 141.306 7.58809 176.75 8.59886C217.874 9.77162 258.906 11.0553 300 14.4892" stroke="#E55050" stroke-width="10" stroke-linecap="round"/></svg>`,
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.99805 20.9998C65.6267 17.4649 126.268 13.845 187.208 12.8887C226.483 12.2723 265.751 13.2796 304.998 13.9998" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></svg>`,
  `<svg width="310" height="40" viewBox="0 0 310 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 29.8857C52.3147 26.9322 99.4329 21.6611 146.503 17.1765C151.753 16.6763 157.115 15.9505 162.415 15.6551C163.28 15.6069 165.074 15.4123 164.383 16.4275C161.704 20.3627 157.134 23.7551 153.95 27.4983C153.209 28.3702 148.194 33.4751 150.669 34.6605C153.638 36.0819 163.621 32.6063 165.039 32.2029C178.55 28.3608 191.49 23.5968 204.869 19.5404C231.903 11.3436 259.347 5.83254 288.793 5.12258C294.094 4.99476 299.722 4.82265 305 5.45025" stroke="#E55050" stroke-width="10" stroke-linecap="round"/></svg>`
]

// 获取box引用数组
const getBoxRefs = () => [brandingBox, designBox, developmentBox]

// SVG装饰函数
const decorateSVG = (svgEl: SVGElement) => {
  svgEl.setAttribute('class', 'text-draw__box-svg')
  svgEl.setAttribute('preserveAspectRatio', 'none')
  svgEl.querySelectorAll('path').forEach(path => {
    path.setAttribute('stroke', 'currentColor')
  })
}

// 鼠标进入处理
const handleMouseEnter = (index: number) => {
  const boxes = getBoxRefs()
  const box = boxes[index].value
  if (!box) return

  // 防止重复播放
  if (enterTweens.value[index] && enterTweens.value[index]!.isActive()) return
  if (leaveTweens.value[index] && leaveTweens.value[index]!.isActive()) {
    leaveTweens.value[index]!.kill()
  }

  // 随机开始索引
  if (nextIndex.value === null) {
    nextIndex.value = Math.floor(Math.random() * svgVariants.length)
  }

  // 动画绘制
  box.innerHTML = svgVariants[nextIndex.value]
  const svg = box.querySelector('svg') as SVGElement
  if (svg) {
    decorateSVG(svg)
    const path = svg.querySelector('path') as SVGPathElement
    if (path) {
      gsap.set(path, { drawSVG: '0%' })
      enterTweens.value[index] = gsap.to(path, {
        duration: 0.5,
        drawSVG: '100%',
        ease: 'power2.inOut',
        onComplete: () => { 
          enterTweens.value[index] = null 
        }
      })
    }
  }

  // 为下次悬停推进索引
  nextIndex.value = (nextIndex.value + 1) % svgVariants.length
}

// 鼠标离开处理
const handleMouseLeave = (index: number) => {
  const boxes = getBoxRefs()
  const box = boxes[index].value
  if (!box) return

  const path = box.querySelector('path') as SVGPathElement
  if (!path) return

  const playOut = () => {
    // 防止重复播放退出动画
    if (leaveTweens.value[index] && leaveTweens.value[index]!.isActive()) return
    leaveTweens.value[index] = gsap.to(path, {
      duration: 0.5,
      drawSVG: '100% 100%',
      ease: 'power2.inOut',
      onComplete: () => {
        leaveTweens.value[index] = null
        box.innerHTML = '' // 完成后移除SVG
      }
    })
  }

  if (enterTweens.value[index] && enterTweens.value[index]!.isActive()) {
    // 等待绘制完成
    enterTweens.value[index]!.eventCallback('onComplete', playOut)
  } else {
    playOut()
  }
}

// 清理函数
const cleanup = () => {
  enterTweens.value.forEach(tween => tween?.kill())
  leaveTweens.value.forEach(tween => tween?.kill())
}

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
/* 从Osmo UI提取的核心CSS变量 */
:root {
  --color-light: #efeeec;
  --color-dark: #131313;
  --color-primary: #ff4c24;
  --color-neutral-100: #ffffff;
  --color-neutral-200: #efeeec;
  --color-neutral-800: #131313;
  --gap: 2em;
  --section-padding: calc(3.5em + (var(--gap) * 2));
  --container-padding: 2em;
  --cubic-default: cubic-bezier(0.65, 0.05, 0, 1);
  --duration-default: 0.735s;
  --animation-default: var(--duration-default) var(--cubic-default);
}

/* 响应式容器padding */
@media screen and (max-width: 991px) {
  :root {
    --container-padding: 1.5em;
  }
}

@media screen and (max-width: 767px) {
  :root {
    --container-padding: 1em;
  }
}

/* 引入自定义字体 */
@font-face {
  font-family: 'PP Neue Montreal';
  src: url('https://cdn.prod.website-files.com/6819ed8312518f61b84824df/6819ed8312518f61b84825ba_PPNeueMontreal-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

/* 基础样式重置 */
*,
*:after,
*:before {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}

/* 全局样式重置 */
:deep(body) {
  background-color: #fefaee;
  font-family: PP Neue Montreal, Arial, sans-serif;
  color: #340824;
  font-size: 1vw;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
  min-height: 100%;
  cursor: url("https://cdn.prod.website-files.com/6708f85ff3d3cba6aff436fb/671251b239d7aeb290a31ac5_cursor-default%402x.svg") 2 0, auto;
}

:deep(a),
:deep(button) {
  cursor: url("https://cdn.prod.website-files.com/6708f85ff3d3cba6aff436fb/671251b212e6b71494aa67ff_cursor-pointer%402x.svg") 12 0, pointer;
}

.cloneable {
  padding: var(--section-padding, 2rem) var(--container-padding, 2rem);
  justify-content: center;
  align-items: center;
  min-height: 100svh;
  display: flex;
  position: relative;
}

.text-draw {
  color: #340824;
  margin-left: 1em;
  margin-right: 1em;
  font-size: 3.5vw;
  text-decoration: none;
}

.text-draw__p {
  margin-bottom: 0;
  font-size: 1.5em;
  font-weight: 500;
  line-height: 1.1;
}

.text-draw__box {
  color: #e55050;
  width: 100%;
  height: 0.625em;
  position: relative;
}

:deep(.text-draw__box-svg) {
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: visible !important;
}

.osmo-credits {
  z-index: 999;
  pointer-events: none;
  flex-flow: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 4em;
  padding: 1em;
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  font-size: 1vw;
}

.osmo-credits__p {
  pointer-events: auto;
  color: rgba(19, 19, 19, 0.5);
  text-align: center;
  margin: 0;
  font-family: PP Neue Montreal, Arial, sans-serif;
  font-size: 1.125em;
  font-weight: 500;
  line-height: 1.3;
}

.osmo-credits__p-a {
  color: #340824;
}

.w-inline-block {
  display: inline-block;
}
</style>