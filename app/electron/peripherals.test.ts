import { describe, expect, it } from 'vitest'
import { fromPmset, fromProfiler, fromRegistry, lowest, merge } from './peripherals'

// shaped like macOS 14/15 output
const PROFILER = JSON.stringify({
  SPBluetoothDataType: [{
    controller_properties: { controller_state: 'attrib_on' },
    device_connected: [
      { 'AirPods Pro de Yuji': { device_address: 'AA:BB', device_batteryLevelCase: '52%', device_batteryLevelLeft: '100%', device_batteryLevelRight: '17%', device_minorType: 'Headphones' } },
      { 'MX Master 3S': { device_address: 'CC:DD', device_batteryLevelMain: '70%', device_minorType: 'Mouse' } },
      { 'Magic Keyboard': { device_address: 'EE:FF', device_minorType: 'Keyboard' } },
      { 'JBL Flip 6': { device_address: '11:22', device_minorType: 'Speaker' } },
    ],
    device_not_connected: [{ 'Old Mouse': { device_address: '33:44' } }],
  }],
})
const REGISTRY = `+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>
    {
      "Product" = "Magic Keyboard"
      "BatteryPercent" = 64
      "BatteryStatusFlags" = 3
    }
+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>
    {
      "Product" = "Magic Trackpad"
      "BatteryPercent" = 9
      "BatteryStatusFlags" = 0
    }`

describe('peripherals', () => {
  it('reads connected devices and each part of AirPods', () => {
    const p = fromProfiler(PROFILER)
    expect(p.map((x) => [x.name, x.kind])).toEqual([['AirPods Pro de Yuji', 'headphones'], ['MX Master 3S', 'mouse'], ['Magic Keyboard', 'keyboard'], ['JBL Flip 6', 'speaker']])
    expect(p[0]!.levels).toEqual([{ part: 'left', percent: 100 }, { part: 'right', percent: 17 }, { part: 'case', percent: 52 }])
  })
  it('reads Apple input devices from the registry, with charging', () => {
    expect(fromRegistry(REGISTRY)).toEqual([
      { name: 'Magic Keyboard', kind: 'keyboard', levels: [{ part: 'main', percent: 64 }], charging: true },
      { name: 'Magic Trackpad', kind: 'trackpad', levels: [{ part: 'main', percent: 9 }], charging: false },
    ])
  })
  it('merges both, lowest first; the warning level ignores the case', () => {
    const m = merge(fromProfiler(PROFILER), fromRegistry(REGISTRY))
    expect(m.map((x) => [x.name, lowest(x)])).toEqual([['Magic Trackpad', 9], ['AirPods Pro de Yuji', 17], ['Magic Keyboard', 64], ['MX Master 3S', 70], ['JBL Flip 6', 101]])
    expect(m.find((x) => x.name === 'Magic Keyboard')!.charging).toBe(true)
  })
  it('survives bad output', () => {
    expect(fromProfiler('not json')).toEqual([])
    expect(fromRegistry('')).toEqual([])
  })
  it("reads the Mac's own battery", () => {
    expect(fromPmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t87%; charging; 1:02 remaining present: true\n")).toEqual({ name: 'This Mac', kind: 'mac', levels: [{ part: 'main', percent: 87 }], charging: true })
    expect(fromPmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t12%; discharging; 0:40 remaining present: true")!.charging).toBe(false)
    expect(fromPmset("Now drawing from 'AC Power'")).toBeNull()
  })
})
