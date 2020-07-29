import { removeElement, computeEdges } from '@fullcalendar/common'


// TODO: assume the el has no borders?
export function getScrollCanvasOrigin(scrollEl: HTMLElement) { // best place for this?
  let rect = scrollEl.getBoundingClientRect()
  let edges = computeEdges(scrollEl) // TODO: pass in isRtl?

  return {
    left: rect.left + edges.borderLeft + edges.scrollbarLeft - getScrollFromLeftEdge(scrollEl),
    top: rect.top + edges.borderTop - scrollEl.scrollTop
  }
}


export function getScrollFromLeftEdge(el: HTMLElement) {
  let val = el.scrollLeft
  let computedStyles = window.getComputedStyle(el) // TODO: pass in isRtl?

  if (computedStyles.direction === 'rtl') {
    switch (getRtlScrollSystem()) {
      case 'negative':
        val = el.scrollWidth - el.clientWidth + val // maxScrollDistance + val
        break
      case 'reverse':
        val = el.scrollWidth - el.clientWidth - val // maxScrollDistance - val
        break
    }
  }

  return val
}


/*
`val` is in the "negative" scheme
*/
export function setScrollFromStartingEdge(el: HTMLElement, val: number) {
  let computedStyles = window.getComputedStyle(el) // TODO: pass in isRtl?

  if (computedStyles.direction === 'rtl') {
    switch (getRtlScrollSystem()) {
      case 'positive':
        val = (el.scrollWidth - el.clientWidth) + val // maxScrollDistance + val
        break
      case 'reverse':
        val = -val
        break
    }
  }

  el.scrollLeft = val
}


// Horizontal Scroll System Detection
// ----------------------------------------------------------------------------------------------

let _rtlScrollSystem

function getRtlScrollSystem() {
  return _rtlScrollSystem || (_rtlScrollSystem = detectRtlScrollSystem())
}

function detectRtlScrollSystem() {
  let el = document.createElement('div')
  el.style.position = 'absolute'
  el.style.top = '-1000px'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.overflow = 'scroll'
  el.style.direction = 'rtl'
  el.style.fontSize = '100px'
  el.innerHTML = 'A'

  document.body.appendChild(el)

  let system
  if (el.scrollLeft > 0) {
    system = 'positive' // scroll is a positive number from the left edge
  } else {
    el.scrollLeft = 1
    if (el.scrollLeft > 0) {
      system = 'reverse' // scroll is a positive number from the right edge
    } else {
      system = 'negative' // scroll is a negative number from the right edge
    }
  }

  removeElement(el)
  return system
}

