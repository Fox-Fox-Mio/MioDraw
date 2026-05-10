/**
 * 工作流 / 生图提示音工具
 */

let customSoundDataUrl = null
let volume = 0.6

export function setCustomSound(dataUrl) {
  customSoundDataUrl = dataUrl
}

export function getCustomSound() {
  return customSoundDataUrl
}

export function setVolume(val) {
  volume = Math.max(0, Math.min(1, val))
}

export function getVolume() {
  return volume
}

export function playNotificationSound() {
  try {
    if (customSoundDataUrl) {
      const audio = new Audio(customSoundDataUrl)
      audio.volume = volume
      audio.play().catch(() => {})
    } else {
      playDefaultBeep()
    }
  } catch { /* ignore */ }
}

function playDefaultBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(volume * 0.5, startTime)
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    const now = audioCtx.currentTime
    playTone(880, now, 0.15)
    playTone(1100, now + 0.18, 0.15)
  } catch { /* ignore */ }
}