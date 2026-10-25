// Fabrics presets: physical behaviour and shading per textile, plus the cloth material with burn, weave shading and fabric back side.
import * as THREE from 'three';
import { weaveTexture } from './textures.js';

export const FABRICS = {
  silk: {
    name: 'Silk', note: 'Liquid and glossy',
    stretch: 0, shear: 4e-7, bend: 1.2e-5, damping: 0.25, aero: 1.6, friction: 0.12, tear: 1.6,
    burnRate: 0.85, spread: 7, selfExtinguish: 0,
    weave: 'satin', weaveTile: 0.01, normalScale: 0.18, weaveShade: 0.06,
    rough: 0.3, sheen: 0.35, sheenRough: 0.22, sheenTint: 0.55, aniso: 0.75, specular: 0.9, opacity: 1,
  },
  chiffon: {
    name: 'Chiffon', note: 'Sheer and floaty',
    stretch: 0, shear: 8e-7, bend: 3e-5, damping: 0.4, aero: 2.0, friction: 0.18, tear: 1.38,
    burnRate: 1.6, spread: 12, selfExtinguish: 0,
    weave: 'plain', weaveTile: 0.006, normalScale: 0.12, weaveShade: 0.05,
    rough: 0.55, sheen: 0.25, sheenRough: 0.4, sheenTint: 0.4, aniso: 0, specular: 0.5, opacity: 0.42,
  },
  linen: {
    name: 'Linen', note: 'Crisp and breathable',
    stretch: 0, shear: 2e-7, bend: 2.2e-6, damping: 0.3, aero: 0.9, friction: 0.35, tear: 1.9,
    burnRate: 0.6, spread: 5.5, selfExtinguish: 0,
    weave: 'plain', weaveTile: 0.018, normalScale: 0.55, weaveShade: 0.18,
    rough: 0.88, sheen: 0.1, sheenRough: 0.7, sheenTint: 0.3, aniso: 0, specular: 0.35, opacity: 1,
  },
  velvet: {
    name: 'Velvet', note: 'Heavy and plush',
    stretch: 0, shear: 3e-7, bend: 4e-6, damping: 0.45, aero: 0.45, friction: 0.55, tear: 2.1,
    burnRate: 0.45, spread: 4, selfExtinguish: 0,
    weave: 'pile', weaveTile: 0.004, normalScale: 0.08, weaveShade: 0.02,
    rough: 0.95, sheen: 1, sheenRough: 0.32, sheenTint: 1.6, aniso: 0, specular: 0.2, opacity: 1,
  },
  denim: {
    name: 'Denim', note: 'Stiff diagonal twill',
    stretch: 0, shear: 1e-7, bend: 6e-7, damping: 0.35, aero: 0.5, friction: 0.5, tear: 2.6,
    burnRate: 0.4, spread: 3.6, selfExtinguish: 0,
    weave: 'twill', weaveTile: 0.016, normalScale: 0.8, weaveShade: 0.3,
    rough: 0.85, sheen: 0.15, sheenRough: 0.6, sheenTint: 0.6, aniso: 0, specular: 0.3, opacity: 1,
  },
  wool: {
    name: 'Wool', note: 'Thick, warm, hard to burn',
    stretch: 0, shear: 3e-7, bend: 2.4e-6, damping: 0.5, aero: 0.4, friction: 0.7, tear: 2.4,
    burnRate: 0.25, spread: 2.2, selfExtinguish: 0.55,
    weave: 'knit', weaveTile: 0.02, normalScale: 0.9, weaveShade: 0.32,
    rough: 1, sheen: 0.6, sheenRough: 0.8, sheenTint: 0.8, aniso: 0, specular: 0.15, opacity: 1,
  },
};

const NOISE = /* glsl */`
float fbHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fbNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fbHash(i), fbHash(i + vec2(1, 0)), u.x), mix(fbHash(i + vec2(0, 1)), fbHash(i + vec2(1, 1)), u.x), u.y); }
`;

function patchBurn(shader, uniforms, lit) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float burn;\nvarying float vBurn;\nvarying vec2 vCloth;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBurn = burn;\nvCloth = uv;');
  let frag = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vBurn;\nvarying vec2 vCloth;\nuniform float uTime;\nuniform float uWeaveShade;\nuniform vec2 uClothSize;\n' + NOISE)
    .replace('#include <map_fragment>', `#include <map_fragment>
      float bnz = fbNoise(vCloth * uClothSize * 26.0) * 0.6 + fbNoise(vCloth * uClothSize * 70.0) * 0.4;
      float bn = vBurn + (bnz - 0.5) * 0.5 * smoothstep(0.0, 0.12, vBurn);
      if (bn > 0.9) discard;
      ${lit ? `
      #ifdef USE_NORMALMAP
        float wh = texture2D(normalMap, vNormalMapUv).a;
        diffuseColor.rgb *= 1.0 - uWeaveShade * (1.0 - wh);
      #endif
      if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3333))), 0.3) * 1.06;
      float charA = smoothstep(0.22, 0.72, bn);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.03, 0.025), charA);
      float ember = smoothstep(0.62, 0.88, bn) * (0.75 + 0.25 * sin(uTime * 17.0 + bnz * 30.0));` : ''}`);
  if (lit) frag = frag.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * ember * 4.0;');
  shader.fragmentShader = frag;
}

export function makeClothMaterial(skin, sizeW, sizeH) {
  const uniforms = { uTime: { value: 0 }, uWeaveShade: { value: 0.1 }, uClothSize: { value: new THREE.Vector2(sizeW, sizeH) } };
  const m = new THREE.MeshPhysicalMaterial({ map: skin.texture, side: THREE.DoubleSide, roughness: 0.8 });
  m.onBeforeCompile = s => patchBurn(s, uniforms, true);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaHash: false });
  depth.onBeforeCompile = s => patchBurn(s, uniforms, false);
  m.userData.uniforms = uniforms;
  m.userData.depth = depth;
  m.userData.size = [sizeW, sizeH];
  return m;
}

export function applyFabric(m, f, color, mesh) {
  const [W, H] = m.userData.size;
  const nm = weaveTexture(f.weave).clone();
  nm.needsUpdate = true;
  nm.repeat.set(W / f.weaveTile, H / f.weaveTile);
  if (m.normalMap) m.normalMap.dispose();
  m.normalMap = nm;
  m.normalScale.set(f.normalScale, f.normalScale);
  m.roughness = f.rough;
  m.sheen = f.sheen;
  m.sheenRoughness = f.sheenRough;
  const sc = new THREE.Color(color).multiplyScalar(f.sheenTint);
  sc.lerp(new THREE.Color(1, 1, 1), 0.12);
  m.sheenColor.copy(sc);
  m.anisotropy = f.aniso;
  m.anisotropyRotation = 0;
  m.specularIntensity = f.specular;
  const sheer = f.opacity < 1;
  m.transparent = sheer;
  m.opacity = f.opacity;
  m.depthWrite = !sheer;
  m.userData.uniforms.uWeaveShade.value = f.weaveShade;
  const d = m.userData.depth;
  d.alphaHash = sheer;
  d.opacity = sheer ? 0.55 : 1;
  d.needsUpdate = true;
  m.needsUpdate = true;
  if (mesh) { mesh.customDepthMaterial = d; mesh.renderOrder = sheer ? 2 : 0; }
}
