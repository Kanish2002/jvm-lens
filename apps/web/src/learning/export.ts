import { toCanvas, toPng } from 'html-to-image'
import { useLearning } from './store'
import { tokens } from './tokens'
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), tokens.playback.interval)
}
const settled = () =>
  new Promise<void>((resolve) =>
    setTimeout(
      () => requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      Number.parseInt(tokens.css.slow)
    )
  )
export async function exportWorkspace(
  node: HTMLElement,
  format: 'png' | 'gif',
  progress: (message: string) => void
): Promise<void> {
  await document.fonts.ready
  const original = useLearning.getState(),
    originalState = {
      index: original.index,
      playing: false,
      focus: original.focus,
      pending: original.pending,
      motionOff: original.motionOff
    }
  const color = getComputedStyle(node).getPropertyValue('--lens-bg').trim()
  const options = {
    backgroundColor: color,
    pixelRatio: 1,
    cacheBust: false,
    filter: (el: HTMLElement) => !el.classList?.contains('lens-export-controls')
  }
  try {
    useLearning.setState({ playing: false, focus: null, pending: null, motionOff: true })
    if (format === 'png') {
      await settled()
      const data = await toPng(node, options)
      const blob = await (await fetch(data)).blob()
      download(blob, `jvm-lens-${original.trace.id}-step-${original.index + 1}.png`)
      return
    }
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc'),
      gif = GIFEncoder()
    // Bound frame count, duration and memory; every teaching step is retained in these short curated traces.
    if (original.trace.steps.length > 60)
      throw new Error(
        'GIF export supports traces up to 60 steps. Export the current step as PNG for longer runs.'
      )
    for (let i = 0; i < original.trace.steps.length; i++) {
      progress(`Rendering frame ${i + 1} / ${original.trace.steps.length}`)
      useLearning.setState({ index: i })
      await settled()
      const width = Math.min(node.clientWidth, tokens.geometry.exportWidth),
        height = Math.round((node.clientHeight * width) / node.clientWidth)
      const canvas = await toCanvas(node, { ...options, canvasWidth: width, canvasHeight: height }),
        context = canvas.getContext('2d')
      if (!context) throw new Error('This browser could not prepare the image. Try exporting PNG.')
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data,
        palette = quantize(rgba, 256)
      gif.writeFrame(applyPalette(rgba, palette), canvas.width, canvas.height, {
        palette,
        delay: tokens.playback.interval / original.speed,
        repeat: 0
      })
    }
    gif.finish()
    download(
      new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' }),
      `jvm-lens-${original.trace.id}.gif`
    )
  } finally {
    useLearning.setState(originalState)
  }
}
