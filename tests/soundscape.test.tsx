// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSoundscape } from "../src/useSoundscape";

const param = () => ({ value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "suspended";
  currentTime = 10;
  destination = {};
  gains: ReturnType<typeof this.createGain>[] = [];
  oscillators: ReturnType<typeof this.createOscillator>[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain = () => {
    const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  };
  createOscillator = () => {
    const oscillator = { type: "sine", frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    this.oscillators.push(oscillator);
    return oscillator;
  };
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
}
let controls: ReturnType<typeof useSoundscape>;
let root: Root;
let container: HTMLDivElement;
function Probe() { controls = useSoundscape(); return <span>{controls.error}</span>; }
beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  FakeAudioContext.instances = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
it("stays silent until enabled, fades volume, throttles cues, and mutes", async () => {
  expect(FakeAudioContext.instances).toHaveLength(0);
  controls.cue();
  await act(async () => controls.toggle());
  const audio = FakeAudioContext.instances[0];
  expect(controls.enabled).toBe(true);
  expect(audio.oscillators).toHaveLength(3);
  expect(audio.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.05, 10, .15);
  await act(async () => controls.changeVolume(900));
  expect(controls.volume).toBe(100);
  expect(audio.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.25, 10, .08);
  await act(async () => controls.changeVolume(NaN));
  expect(controls.volume).toBe(100);
  controls.cue(); controls.cue();
  expect(audio.oscillators).toHaveLength(4);
  expect(audio.oscillators[3].stop).toHaveBeenCalledWith(10.7);
  await act(async () => controls.toggle());
  expect(controls.enabled).toBe(false);
  expect(audio.suspend).toHaveBeenCalled();
  controls.cue();
  expect(audio.oscillators).toHaveLength(4);
});
it("suspends in background, resumes on return, and closes on unmount", async () => {
  await act(async () => controls.toggle());
  const audio = FakeAudioContext.instances[0];
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(audio.state).toBe("suspended");
  controls.cue();
  expect(audio.oscillators).toHaveLength(3);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(audio.state).toBe("running");
  await act(async () => root.render(null));
  expect(audio.close).toHaveBeenCalledOnce();
});
it("keeps explorer controls usable when Web Audio is unavailable", async () => {
  vi.stubGlobal("AudioContext", undefined);
  await act(async () => controls.toggle());
  expect(controls.enabled).toBe(false);
  expect(controls.error).toContain("Audio is unavailable");
});
it("closes the audio graph if background suspension fails", async () => {
  await act(async () => controls.toggle());
  const audio = FakeAudioContext.instances[0];
  audio.suspend.mockRejectedValueOnce(new Error("interrupted"));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(audio.close).toHaveBeenCalledOnce();
  expect(controls.enabled).toBe(false);
  expect(controls.error).toContain("Ambience paused");
});
it("closes a failed context and can retry after browser rejection", async () => {
  vi.stubGlobal("AudioContext", class extends FakeAudioContext { resume = vi.fn(async () => { throw new Error("blocked"); }); });
  await act(async () => controls.toggle());
  expect(controls.enabled).toBe(false);
  expect(FakeAudioContext.instances[0].close).toHaveBeenCalled();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  await act(async () => controls.toggle());
  expect(controls.enabled).toBe(true);
});
