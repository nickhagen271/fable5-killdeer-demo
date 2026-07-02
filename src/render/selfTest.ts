import { StorageBufferAttribute, type WebGPURenderer } from "three/webgpu";
import { Fn, float, instanceIndex, storage } from "three/tsl";

const COUNT = 64;

/**
 * Minimal GPU compute round-trip: write f(i) = 2i + 1 from a compute kernel
 * into a storage buffer, read it back, verify on the CPU. Phases 1+ hang the
 * whole stroke system off compute + storage buffers, so prove the path now.
 */
export async function runComputeSelfTest(renderer: WebGPURenderer): Promise<boolean> {
  const attribute = new StorageBufferAttribute(new Float32Array(COUNT), 1);
  const buffer = storage(attribute, "float", COUNT);

  const kernel = Fn(() => {
    buffer.element(instanceIndex).assign(float(instanceIndex).mul(2).add(1));
  })().compute(COUNT);

  await renderer.computeAsync(kernel);

  const raw = await renderer.getArrayBufferAsync(attribute);
  const data = new Float32Array(raw);

  if (data.length !== COUNT) return false;
  for (let i = 0; i < COUNT; i++) {
    if (data[i] !== 2 * i + 1) return false;
  }
  return true;
}
