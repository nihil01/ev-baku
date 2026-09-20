import * as THREE from "three";

// One unit is an artistic model unit, not a cadastral/metre measurement.
// Original procedural architecture; no stock video, textures, or model downloads.
export const LOOP_SECONDS = 22;

export type SceneController = {
  setPaused: (paused: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  dispose: () => void;
};

type Part = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  delay: number;
  duration: number;
  order: number;
};

type BuildingKind = "tower" | "residence" | "mid" | "slab";

type BuildingSpec = {
  x: number;
  z: number;
  floors: number;
  w: number;
  d: number;
  delay: number;
  stagger: number;
  kind: BuildingKind;
  balcony?: "n" | "s" | "e" | "w";
  setbackFrom?: number;
};

export function createConstructionScene(
  host: HTMLDivElement,
  onProgress: (floor: number, phase: number) => void,
): SceneController {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0xf4f5ef, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 140);
  const lookAt = new THREE.Vector3(0, 4.4, 0.15);
  const world = new THREE.Group();
  scene.add(world);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(geometry);

  function material(color: number, roughness = 0.7, metalness = 0) {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(result);
    return result;
  }

  const stone = material(0xe9e6da);
  const white = material(0xfffcf0);
  const glass = material(0x719c96, 0.24, 0.3);
  const paleGlass = material(0xb1c9c1, 0.34, 0.16);
  const bronze = material(0xb68156, 0.5, 0.23);
  const green = material(0x718c74);
  const pavement = material(0xdadfd3);
  const darkStone = material(0xc9c6ba, 0.78);

  function box(
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb5b9a7, 2.7));
  const sun = new THREE.DirectionalLight(0xffefcf, 3.3);
  sun.position.set(-10, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -22,
    right: 22,
    top: 26,
    bottom: -20,
    near: 1,
    far: 70,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd9edf0, 1.7);
  fill.position.set(12, 10, -8);
  scene.add(fill);

  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.14 });
  materials.add(shadowMaterial);
  const groundGeometry = new THREE.PlaneGeometry(180, 180);
  geometries.add(groundGeometry);
  const ground = new THREE.Mesh(groundGeometry, shadowMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  // Plaza, streets and a shared podium — the neighbourhood sits on one plot.
  box(world, stone, 0, 0.07, 0.2, 18.5, 0.14, 14.5);
  box(world, pavement, 0, 0.16, 0.35, 12.4, 0.1, 9.2);
  box(world, white, 0, 0.24, 0.2, 9.6, 0.12, 6.4);
  box(world, paleGlass, 0, 0.42, 0.15, 4.2, 0.28, 2.4);
  box(world, white, 0, 0.58, 0.15, 4.4, 0.08, 2.55);

  // Distant city fabric — already standing, so the block never reads as empty.
  for (const [x, z, floors, w, d] of [
    [-8.6, -4.6, 6, 1.55, 1.7],
    [-5.8, -5.0, 5, 1.45, 1.55],
    [-2.6, -5.15, 8, 1.6, 1.45],
    [0.4, -5.25, 7, 1.7, 1.4],
    [3.4, -5.05, 5, 1.55, 1.6],
    [6.4, -4.7, 6, 1.5, 1.55],
    [8.8, -3.6, 4, 1.4, 1.5],
    [-9.0, -1.6, 4, 1.35, 1.7],
    [9.05, -0.4, 4, 1.4, 1.55],
    [-8.4, 3.6, 3, 1.7, 1.3],
    [8.5, 3.8, 3, 1.65, 1.25],
  ] as const) {
    const h = floors * 0.36;
    box(world, stone, x, 0.2 + h / 2, z, w, h, d);
    for (let f = 0; f < floors; f++) {
      box(world, white, x, 0.32 + f * 0.36, z, w + 0.08, 0.07, d + 0.08);
      box(world, paleGlass, x, 0.46 + f * 0.36, z + d / 2 + 0.006, w * 0.76, 0.16, 0.02);
    }
    box(world, white, x, h + 0.22, z, w + 0.1, 0.12, d + 0.1);
  }

  // Boulevard dashes and a quiet inner street.
  for (let i = 0; i < 19; i++) {
    box(world, white, -8.2 + i * 0.9, 0.155, 4.15, 0.4, 0.008, 0.04);
  }
  for (let i = 0; i < 9; i++) {
    box(world, white, 0, 0.155, -3.4 + i * 0.85, 0.04, 0.008, 0.32);
  }

  const foliageGeometry = new THREE.IcosahedronGeometry(0.34, 1);
  geometries.add(foliageGeometry);
  for (const [x, z, scale] of [
    [-2.5, 1.55, 1],
    [-1.15, 1.7, 0.85],
    [1.2, 1.7, 0.9],
    [2.55, 1.5, 1.05],
    [-2.4, -2.55, 0.8],
    [2.45, -2.6, 0.8],
    [-5.1, 3.55, 1.1],
    [0, 3.7, 0.95],
    [5.15, 3.6, 1.05],
    [-6.8, 0.6, 0.75],
    [6.9, 0.85, 0.75],
  ] as const) {
    box(world, bronze, x, 0.38, z, 0.05, 0.48, 0.05);
    const tree = new THREE.Mesh(foliageGeometry, green);
    tree.position.set(x, 0.78, z);
    tree.scale.set(0.85 * scale, 1.35 * scale, 0.85 * scale);
    tree.castShadow = true;
    world.add(tree);
  }

  // Abstract parked cars — scale cues, not toys.
  for (const [x, z, rot] of [
    [-5.4, 4.35, 0],
    [-3.6, 4.32, 0.04],
    [4.2, 4.38, -0.03],
    [6.0, 4.3, 0.02],
  ] as const) {
    const car = new THREE.Group();
    car.position.set(x, 0.22, z);
    car.rotation.y = rot;
    box(car, darkStone, 0, 0.08, 0, 0.85, 0.16, 0.38);
    box(car, glass, 0.05, 0.22, 0, 0.5, 0.14, 0.34);
    world.add(car);
  }

  const basinGeometry = new THREE.CylinderGeometry(0.72, 0.78, 0.16, 24);
  geometries.add(basinGeometry);
  const basin = new THREE.Mesh(basinGeometry, white);
  basin.position.set(0, 0.34, 1.55);
  basin.castShadow = true;
  basin.receiveShadow = true;
  world.add(basin);
  const waterGeometry = new THREE.CylinderGeometry(0.58, 0.58, 0.05, 24);
  geometries.add(waterGeometry);
  const water = new THREE.Mesh(waterGeometry, glass);
  water.position.set(0, 0.42, 1.55);
  world.add(water);

  const batches = new Map<THREE.Material, Part[]>();
  function part(mat: THREE.Material, p: Part) {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(p);
  }

  const buildings: BuildingSpec[] = [
    {
      x: 0.1,
      z: -1.15,
      floors: 18,
      w: 3.05,
      d: 2.45,
      delay: 0.35,
      stagger: 0.24,
      kind: "tower",
      setbackFrom: 12,
    },
    {
      x: -3.95,
      z: -0.55,
      floors: 13,
      w: 2.45,
      d: 2.2,
      delay: 0.9,
      stagger: 0.19,
      kind: "residence",
      balcony: "s",
    },
    {
      x: 4.0,
      z: -0.65,
      floors: 12,
      w: 2.55,
      d: 2.1,
      delay: 1.15,
      stagger: 0.19,
      kind: "residence",
      balcony: "w",
    },
    {
      x: -3.35,
      z: 2.45,
      floors: 7,
      w: 2.15,
      d: 1.8,
      delay: 1.7,
      stagger: 0.17,
      kind: "mid",
      balcony: "n",
    },
    {
      x: 3.4,
      z: 2.55,
      floors: 6,
      w: 2.2,
      d: 1.7,
      delay: 1.95,
      stagger: 0.17,
      kind: "mid",
      balcony: "n",
    },
    {
      x: -7.05,
      z: -1.85,
      floors: 10,
      w: 1.95,
      d: 2.35,
      delay: 1.35,
      stagger: 0.16,
      kind: "slab",
    },
    {
      x: 7.1,
      z: -1.55,
      floors: 9,
      w: 2.0,
      d: 2.2,
      delay: 1.5,
      stagger: 0.16,
      kind: "slab",
    },
    {
      x: -6.55,
      z: 2.85,
      floors: 5,
      w: 1.85,
      d: 1.5,
      delay: 2.3,
      stagger: 0.15,
      kind: "mid",
    },
    {
      x: 6.6,
      z: 3.0,
      floors: 5,
      w: 1.9,
      d: 1.45,
      delay: 2.45,
      stagger: 0.15,
      kind: "mid",
    },
  ];

  function addBuilding(spec: BuildingSpec) {
    const floorH = spec.kind === "tower" ? 0.44 : 0.38;
    const mullions = spec.kind === "tower" ? 6 : spec.kind === "residence" ? 5 : 4;
    const depthMullions = spec.kind === "tower" ? 4 : 3;

    for (let f = 0; f < spec.floors; f++) {
      const taper =
        spec.setbackFrom != null && f >= spec.setbackFrom
          ? Math.max(0.64, 1 - (f - spec.setbackFrom + 1) * 0.07)
          : 1;
      const w = spec.w * taper;
      const d = spec.d * (taper * 0.92 + 0.08);
      const y = 0.7 + f * floorH;
      const delay = spec.delay + f * spec.stagger;
      const order = f + Math.round((spec.x + 8) * 0.08);
      const slabGlass = f % 5 === 0 ? paleGlass : glass;

      part(white, {
        x: spec.x,
        y,
        z: spec.z,
        w: w + 0.2,
        h: 0.085,
        d: d + 0.2,
        delay,
        duration: 0.5,
        order,
      });

      for (const cx of [-w / 2 + 0.09, w / 2 - 0.09]) {
        for (const cz of [-d / 2 + 0.09, d / 2 - 0.09]) {
          part(stone, {
            x: spec.x + cx,
            y: y + 0.22,
            z: spec.z + cz,
            w: 0.12,
            h: floorH - 0.04,
            d: 0.12,
            delay: delay + 0.18,
            duration: 0.48,
            order,
          });
        }
      }

      for (const face of [-1, 1]) {
        part(slabGlass, {
          x: spec.x,
          y: y + 0.22,
          z: spec.z + face * (d / 2),
          w,
          h: floorH - 0.1,
          d: 0.042,
          delay: delay + 1.35,
          duration: 0.65,
          order,
        });
        for (let i = 0; i <= mullions; i++) {
          part(stone, {
            x: spec.x - w / 2 + (w * i) / mullions,
            y: y + 0.22,
            z: spec.z + face * (d / 2) * 1.02,
            w: 0.03,
            h: floorH - 0.06,
            d: 0.048,
            delay: delay + 1.55,
            duration: 0.45,
            order,
          });
        }
      }

      for (const face of [-1, 1]) {
        part(glass, {
          x: spec.x + face * (w / 2),
          y: y + 0.22,
          z: spec.z,
          w: 0.038,
          h: floorH - 0.1,
          d,
          delay: delay + 1.5,
          duration: 0.55,
          order,
        });
        for (let i = 1; i < depthMullions; i++) {
          part(stone, {
            x: spec.x + face * (w / 2) * 1.02,
            y: y + 0.22,
            z: spec.z - d / 2 + (d * i) / depthMullions,
            w: 0.048,
            h: floorH - 0.06,
            d: 0.032,
            delay: delay + 1.7,
            duration: 0.45,
            order,
          });
        }
      }

      if (spec.balcony && f > 0 && f < spec.floors - 1 && f % 2 === 1) {
        const depth = 0.22;
        const bx =
          spec.balcony === "e" ? spec.x + w / 2 + depth / 2 : spec.balcony === "w" ? spec.x - w / 2 - depth / 2 : spec.x;
        const bz =
          spec.balcony === "n" ? spec.z + d / 2 + depth / 2 : spec.balcony === "s" ? spec.z - d / 2 - depth / 2 : spec.z;
        const bw = spec.balcony === "e" || spec.balcony === "w" ? depth : w * 0.62;
        const bd = spec.balcony === "n" || spec.balcony === "s" ? depth : d * 0.62;
        part(white, {
          x: bx,
          y: y + 0.02,
          z: bz,
          w: bw,
          h: 0.045,
          d: bd,
          delay: delay + 1.85,
          duration: 0.4,
          order,
        });
        part(paleGlass, {
          x: bx,
          y: y + 0.14,
          z: bz,
          w: spec.balcony === "e" || spec.balcony === "w" ? 0.03 : bw,
          h: 0.16,
          d: spec.balcony === "n" || spec.balcony === "s" ? 0.03 : bd,
          delay: delay + 2,
          duration: 0.35,
          order,
        });
      }
    }

    const roofY = 0.7 + spec.floors * floorH;
    const roofDelay = spec.delay + spec.floors * spec.stagger + 0.2;
    const roofOrder = spec.floors + 2;
    const capW = spec.setbackFrom ? spec.w * 0.72 : spec.w;
    const capD = spec.setbackFrom ? spec.d * 0.72 : spec.d;
    part(white, {
      x: spec.x,
      y: roofY + 0.05,
      z: spec.z,
      w: capW + 0.22,
      h: 0.12,
      d: capD + 0.22,
      delay: roofDelay,
      duration: 0.55,
      order: roofOrder,
    });

    if (spec.kind === "tower") {
      part(bronze, {
        x: spec.x,
        y: roofY + 0.18,
        z: spec.z,
        w: capW + 0.05,
        h: 0.1,
        d: capD + 0.05,
        delay: roofDelay + 0.25,
        duration: 0.5,
        order: roofOrder,
      });
      part(stone, {
        x: spec.x,
        y: roofY + 0.48,
        z: spec.z - 0.15,
        w: 1.15,
        h: 0.45,
        d: 0.9,
        delay: roofDelay + 0.4,
        duration: 0.55,
        order: roofOrder,
      });
    } else if (spec.kind === "residence") {
      part(green, {
        x: spec.x - capW * 0.18,
        y: roofY + 0.18,
        z: spec.z,
        w: capW * 0.28,
        h: 0.12,
        d: capD * 0.4,
        delay: roofDelay + 0.3,
        duration: 0.4,
        order: roofOrder,
      });
    }
  }

  for (const spec of buildings) addBuilding(spec);

  const animatedBatches = [...batches].map(([mat, parts]) => {
    const mesh = new THREE.InstancedMesh(geometry, mat, parts.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    world.add(mesh);
    return { mesh, parts };
  });

  const dummy = new THREE.Object3D();
  let elapsed = 0;
  let last = 0;
  let raf = 0;
  let paused = false;
  let reduced = false;
  let visible = true;
  let disposed = false;
  let contextLost = false;
  let lastFloor = -1;
  let lastPhase = -1;
  const maxOrder = buildings.reduce((n, b) => Math.max(n, b.floors), 0);

  const smooth = (v: number) => {
    const t = THREE.MathUtils.clamp(v, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function render() {
    const t = reduced ? 15 : elapsed % LOOP_SECONDS;
    // 0–13: neighbourhood rises, 13–17: hold, 17–21.5: recede from the roofs down.
    const phase = t < 13 ? 0 : t < 17 ? 1 : 2;
    for (const { mesh, parts } of animatedBatches) {
      parts.forEach((p, i) => {
        const build = smooth((t - p.delay) / p.duration);
        const retreat = 1 - smooth((t - 17 - (maxOrder - p.order) * 0.09) / 0.85);
        const progress = build * retreat;
        dummy.position.set(
          p.x,
          p.y - (p.h * (1 - progress)) / 2 + (1 - build) * 0.32,
          p.z,
        );
        dummy.scale.set(
          p.w * Math.max(progress, 0.00001),
          p.h * Math.max(progress, 0.00001),
          p.d * Math.max(progress, 0.00001),
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    const angle = 0.64 + Math.sin((t / LOOP_SECONDS) * Math.PI * 2) * 0.11;
    const dist = 32;
    camera.position.set(Math.sin(angle) * dist, 17.2, Math.cos(angle) * dist);
    camera.lookAt(lookAt);
    const floor =
      phase === 2
        ? Math.max(0, Math.ceil(maxOrder * (1 - smooth((t - 17) / 4))))
        : Math.min(maxOrder, Math.max(0, Math.floor((t - 0.5) / 0.24) + 1));
    if (floor !== lastFloor || phase !== lastPhase) {
      onProgress(floor, phase);
      lastFloor = floor;
      lastPhase = phase;
    }
    renderer.render(scene, camera);
  }

  function canAnimate() {
    return !disposed && !contextLost && !paused && !reduced && visible && !document.hidden;
  }

  function tick(now: number) {
    raf = 0;
    if (!canAnimate()) return;
    if (last) elapsed += Math.min((now - last) / 1000, 0.08);
    last = now;
    render();
    raf = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (canAnimate()) raf = requestAnimationFrame(tick);
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed || contextLost) return;
    const aspect = width / height;
    const verticalSpan = Math.max(22.5, 23 / aspect);
    camera.left = (-verticalSpan * aspect) / 2;
    camera.right = (verticalSpan * aspect) / 2;
    camera.top = verticalSpan / 2;
    camera.bottom = -verticalSpan / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(host);
  document.addEventListener("visibilitychange", sync);
  const loseContext = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    sync();
  };
  const restoreContext = () => {
    contextLost = false;
    resize();
    sync();
  };
  renderer.domElement.addEventListener("webglcontextlost", loseContext);
  renderer.domElement.addEventListener("webglcontextrestored", restoreContext);
  resize();
  sync();

  return {
    setPaused(value) {
      paused = value;
      sync();
    },
    setReducedMotion(value) {
      reduced = value;
      if (!contextLost) render();
      sync();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      renderer.domElement.removeEventListener("webglcontextlost", loseContext);
      renderer.domElement.removeEventListener("webglcontextrestored", restoreContext);
      animatedBatches.forEach(({ mesh }) => mesh.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
