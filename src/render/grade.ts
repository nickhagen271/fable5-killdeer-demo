import { PostProcessing, type PerspectiveCamera, type Scene, type WebGPURenderer } from "three/webgpu";
import { clamp, mix, pass, vec3, vec4 } from "three/tsl";

/**
 * The color-script grade — the last glaze over the whole frame. A gentle
 * warm unifying wash, a soft filmic S-curve, a whisper of saturation, and a
 * floor that keeps even the deepest accent luminous. Deliberately subtle:
 * the paint is in the strokes and the LUT; this only pulls the frame
 * together. `?grade=0` disables it (the filter test: the ungraded frame must
 * still be a painting — and it is, because nothing painterly lives here).
 */
export function buildGrade(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): PostProcessing {
  const post = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);

  let c = scenePass.getTextureNode().rgb;

  // Warm glaze: late-morning amber pulled across everything.
  c = c.mul(vec3(1.045, 1.006, 0.952)).add(vec3(0.012, 0.008, 0.0));

  // Soft S-curve, blended in lightly — contact without crunch.
  const curved = c.mul(c).mul(vec3(3.0, 3.0, 3.0).sub(c.mul(2.0)));
  c = mix(c, curved, 0.22);

  // A whisper more color, then the high-key floor: nothing reaches black.
  const luma = c.dot(vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma, luma, luma), c, 1.06);
  c = c.mul(0.985).add(vec3(0.012, 0.011, 0.013));

  post.outputNode = vec4(clamp(c, 0.0, 1.0), 1.0);
  return post;
}
