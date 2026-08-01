import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

// ============================================================
// CONFIGURATION
// ============================================================

const PARTICLE_COUNT = 10000;
const SCALE = 2.2;

// The full countdown sequence
const NUMBERS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'];

// How long each number holds before morphing (ms)
const HOLD_TIME = 4000;

// Morph duration — particles lerp directly between shapes (ms)
const MORPH_TIME = 2000;

// Finale timing (ms)
const FINALE_HOLD = 2500;     // Hold on "0" before converging
const FINALE_CONVERGE = 3500; // Particles converge to origin
const FINALE_FADE = 3000;     // Screen fades to black
const FINALE_BLACK = 1500;    // Pause before "Again?" appears

// ============================================================
// COLOR PALETTES — cool → warm → hot → white
// ============================================================

const PHASE_PALETTES: [number, number, number][][] = [
  [[0.31, 0.27, 0.90], [0.55, 0.36, 0.96], [0.05, 0.65, 0.91]], // 10
  [[0.26, 0.22, 0.79], [0.49, 0.23, 0.93], [0.01, 0.52, 0.78]], // 9
  [[0.22, 0.19, 0.64], [0.43, 0.16, 0.85], [0.05, 0.58, 0.53]], // 8
  [[0.05, 0.58, 0.53], [0.02, 0.71, 0.83], [0.23, 0.51, 0.96]], // 7
  [[0.06, 0.46, 0.43], [0.03, 0.57, 0.70], [0.39, 0.40, 0.95]], // 6
  [[0.85, 0.47, 0.02], [0.03, 0.57, 0.70], [0.49, 0.33, 0.93]], // 5
  [[0.92, 0.35, 0.05], [0.85, 0.47, 0.02], [0.66, 0.33, 0.96]], // 4
  [[0.86, 0.15, 0.15], [0.92, 0.35, 0.05], [0.96, 0.62, 0.04]], // 3
  [[0.94, 0.27, 0.27], [0.98, 0.45, 0.09], [0.92, 0.72, 0.03]], // 2
  [[0.97, 0.44, 0.44], [0.98, 0.57, 0.24], [0.99, 0.88, 0.28]], // 1
  [[1.0,  1.0,  1.0 ], [1.0,  0.95, 0.78], [1.0,  0.90, 0.54]], // 0
];

const FINALE_PALETTE: [number, number, number][] =
  [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 0.97, 0.91]];

// ============================================================
// GEOMETRY — digit target generators
// ============================================================

const generateTargets = (numberStr: string): Float32Array => {
  const targets = new Float32Array(PARTICLE_COUNT * 3);
  const idx = { value: 0 };
  const S = SCALE;
  const T = 0.18 * S; // thin stroke — digits need to READ

  // Distribute particles along a line segment with thickness
  const line = (x1: number, y1: number, x2: number, y2: number, count: number) => {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular direction for stroke thickness
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i < count && idx.value < PARTICLE_COUNT * 3; i++) {
      const t = Math.random();
      const offset = (Math.random() - 0.5) * T;
      targets[idx.value++] = x1 + dx * t + nx * offset;
      targets[idx.value++] = y1 + dy * t + ny * offset;
      targets[idx.value++] = (Math.random() - 0.5) * 0.15; // very shallow depth
    }
  };

  // Distribute particles along an arc with thickness
  const arc = (
    cx: number, cy: number,
    rx: number, ry: number,
    startAngle: number, endAngle: number,
    count: number
  ) => {
    for (let i = 0; i < count && idx.value < PARTICLE_COUNT * 3; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const rOffset = (Math.random() - 0.5) * T;
      targets[idx.value++] = cx + (rx + rOffset) * Math.cos(angle);
      targets[idx.value++] = cy + (ry + rOffset) * Math.sin(angle);
      targets[idx.value++] = (Math.random() - 0.5) * 0.15;
    }
  };

  const PI = Math.PI;
  const TAU = PI * 2;

  switch (numberStr) {
    case '10': {
      const offset = -0.55 * S;
      // "1" on the left — vertical stroke + small serif
      line(offset, -1.6 * S, offset, 1.6 * S, 2500);
      line(offset - 0.35 * S, 0.9 * S, offset, 1.6 * S, 500);
      // "0" on the right — tall ellipse
      arc(0.85 * S, 0, 0.75 * S, 1.3 * S, 0, TAU, 7000);
      break;
    }

    case '9': {
      arc(0, 0.55 * S, 0.82 * S, 0.82 * S, 0, TAU, 5500);
      line(0.8 * S, 0.55 * S, 0.5 * S, -1.7 * S, 4500);
      break;
    }

    case '8': {
      arc(0, 0.75 * S, 0.68 * S, 0.68 * S, 0, TAU, 4800);
      arc(0, -0.72 * S, 0.75 * S, 0.78 * S, 0, TAU, 5200);
      break;
    }

    case '7': {
      line(-0.7 * S, 1.5 * S, 0.8 * S, 1.5 * S, 2500);
      line(0.8 * S, 1.5 * S, -0.15 * S, -1.7 * S, 7500);
      break;
    }

    case '6': {
      arc(0, -0.55 * S, 0.82 * S, 0.82 * S, 0, TAU, 5500);
      arc(-0.15 * S, 0.6 * S, 0.65 * S, 0.95 * S, PI * 0.35, PI * 1.1, 3000);
      line(-0.72 * S, -0.2 * S, -0.55 * S, 1.2 * S, 1500);
      break;
    }

    case '5': {
      line(0.65 * S, 1.5 * S, -0.6 * S, 1.5 * S, 1800);
      line(-0.6 * S, 1.5 * S, -0.6 * S, 0.15 * S, 1700);
      arc(0, -0.55 * S, 0.78 * S, 0.8 * S, -PI * 0.45, PI * 0.55, 6500);
      break;
    }

    case '4': {
      line(-0.7 * S, 1.5 * S, -0.7 * S, -0.15 * S, 2500);
      line(-0.7 * S, -0.15 * S, 0.8 * S, -0.15 * S, 2500);
      line(0.45 * S, 1.7 * S, 0.45 * S, -1.7 * S, 5000);
      break;
    }

    case '3': {
      arc(0.05 * S, 0.65 * S, 0.72 * S, 0.7 * S, -PI * 0.55, PI * 0.55, 5000);
      arc(0.05 * S, -0.65 * S, 0.78 * S, 0.75 * S, -PI * 0.55, PI * 0.55, 5000);
      break;
    }

    case '2': {
      arc(0, 0.55 * S, 0.78 * S, 0.82 * S, PI * 0.05, PI, 3800);
      line(0.78 * S, 0.55 * S, -0.7 * S, -1.4 * S, 3700);
      line(-0.7 * S, -1.5 * S, 0.7 * S, -1.5 * S, 2500);
      break;
    }

    case '1': {
      line(0, -1.7 * S, 0, 1.7 * S, 8500);
      line(-0.4 * S, 1.0 * S, 0, 1.7 * S, 1500);
      break;
    }

    case '0': {
      arc(0, 0, 0.82 * S, 1.35 * S, 0, TAU, 10000);
      break;
    }
  }

  // Fill remainder with the last placed position (avoid origin cluster)
  const lastX = idx.value >= 3 ? targets[idx.value - 3] : 0;
  const lastY = idx.value >= 3 ? targets[idx.value - 2] : 0;
  while (idx.value < PARTICLE_COUNT * 3) {
    targets[idx.value++] = lastX + (Math.random() - 0.5) * T;
    targets[idx.value++] = lastY + (Math.random() - 0.5) * T;
    targets[idx.value++] = (Math.random() - 0.5) * 0.15;
  }
  return targets;
};

// ============================================================
// COLOR HELPERS
// ============================================================

const assignColors = (palette: [number, number, number][]): Float32Array => {
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  return colors;
};

// ============================================================
// PARTICLE SWARM — the core 3D component
// ============================================================

interface SwarmProps {
  phaseIndex: number;
  morphProgress: number; // 0 = fully on current shape, 1 = fully on next shape
  isFinale: boolean;
  finaleProgress: number; // 0→1 during convergence
  isEnded: boolean;
}

const ParticleSwarm = ({ phaseIndex, morphProgress, isFinale, finaleProgress, isEnded }: SwarmProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);
  const mountTime = useRef(performance.now());

  // Positions start scattered
  const pos = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) arr[i] = (Math.random() - 0.5) * 15;
    return arr;
  }, []);
  const vel = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);
  const currentColors = useMemo(() => assignColors(PHASE_PALETTES[0]), []);

  // Pre-compute targets for CURRENT and NEXT digit
  const currentTargets = useRef(generateTargets(NUMBERS[0]));
  const nextTargets = useRef(generateTargets(NUMBERS[1] ?? NUMBERS[0]));
  const currentPaletteColors = useRef(assignColors(PHASE_PALETTES[0]));
  const nextPaletteColors = useRef(assignColors(PHASE_PALETTES[1] ?? PHASE_PALETTES[0]));
  const isHoldingRef = useRef(false);

  // Update targets when phase changes
  useEffect(() => {
    currentTargets.current = generateTargets(NUMBERS[phaseIndex]);
    currentPaletteColors.current = assignColors(
      isFinale ? FINALE_PALETTE : PHASE_PALETTES[phaseIndex]
    );
    const nextIdx = Math.min(phaseIndex + 1, NUMBERS.length - 1);
    nextTargets.current = generateTargets(NUMBERS[nextIdx]);
    nextPaletteColors.current = assignColors(PHASE_PALETTES[nextIdx]);
  }, [phaseIndex, isFinale]);

  // Mouse/touch hold tracking
  useEffect(() => {
    const onDown = () => { isHoldingRef.current = true; };
    const onUp = () => { isHoldingRef.current = false; };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  useFrame((state) => {
    if (!meshRef.current || isEnded) return;
    const time = state.clock.elapsedTime;
    const isHolding = isHoldingRef.current;

    // --- Camera drift ---
    const elapsed = (performance.now() - mountTime.current) / 1000;
    const totalTime = (HOLD_TIME + MORPH_TIME) * NUMBERS.length / 1000 + 15;
    const progress = Math.min(elapsed / totalTime, 1);
    const orbitAngle = Math.sin(progress * Math.PI * 0.6) * 0.18;
    const dollyZ = 12 - progress * 2.5;
    const verticalFloat = Math.sin(elapsed * 0.08) * 0.15;
    state.camera.position.set(
      Math.sin(orbitAngle) * dollyZ,
      verticalFloat,
      Math.cos(orbitAngle) * dollyZ,
    );
    state.camera.lookAt(0, 0, 0);

    // --- Mouse raycasting ---
    const mouse3D = new THREE.Vector3(state.pointer.x, state.pointer.y, 0.5);
    mouse3D.unproject(state.camera);
    mouse3D.sub(state.camera.position).normalize();
    const distToPlane = -state.camera.position.z / mouse3D.z;
    const cursor = state.camera.position.clone().add(mouse3D.multiplyScalar(distToPlane));

    // --- Physics parameters ---
    // Early: tight formation, gentle breathing. Late: looser, more energy.
    const phaseFrac = phaseIndex / (NUMBERS.length - 1); // 0→1 over countdown
    const noiseAmp = 0.008 + phaseFrac * 0.025;          // subtle → moderate
    const noiseFreq = 0.6 + phaseFrac * 0.8;             // slow → faster
    const breathAmp = 0.002 + phaseFrac * 0.006;         // gentle → visible

    // Spring stiffness — high enough to hold shape, eases during morph
    const springBase = 0.12;
    // During morph: soften spring so particles feel fluid, not snapping
    const morphEase = morphProgress > 0 ? Math.sin(morphProgress * Math.PI) * 0.04 : 0;
    const spring = isFinale ? 0.06 + finaleProgress * 0.14 : springBase - morphEase;

    const friction = isFinale ? 0.88 : 0.90;

    // Smooth easing for morph interpolation
    const morphT = morphProgress > 0
      ? morphProgress * morphProgress * (3 - 2 * morphProgress) // smoothstep
      : 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      let vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];

      // Compute target position
      let tx: number, ty: number, tz: number;
      if (isFinale) {
        // Converge to origin smoothly
        tx = 0;
        ty = 0;
        tz = 0;
      } else if (morphT > 0) {
        // Interpolate between current digit and next digit
        tx = currentTargets.current[i3] + (nextTargets.current[i3] - currentTargets.current[i3]) * morphT;
        ty = currentTargets.current[i3 + 1] + (nextTargets.current[i3 + 1] - currentTargets.current[i3 + 1]) * morphT;
        tz = currentTargets.current[i3 + 2] + (nextTargets.current[i3 + 2] - currentTargets.current[i3 + 2]) * morphT;
      } else {
        tx = currentTargets.current[i3];
        ty = currentTargets.current[i3 + 1];
        tz = currentTargets.current[i3 + 2];
      }

      // Spring force toward target
      const dx = tx - px, dy = ty - py, dz = tz - pz;
      vx += dx * spring;
      vy += dy * spring;
      vz += dz * spring;

      // Organic noise — particles breathe and shimmer, not jitter
      if (!isFinale) {
        // Per-particle phase offset based on index for organic motion
        const phase = i * 0.01;
        vx += Math.sin(py * noiseFreq + time * 0.7 + phase) * noiseAmp;
        vy += Math.cos(px * noiseFreq + time * 0.7 + phase) * noiseAmp;
        // Breathing — subtle radial pulse
        const dist = Math.sqrt(px * px + py * py) || 1;
        const breathPulse = Math.sin(time * 1.5 + dist * 0.3) * breathAmp;
        vx += (px / dist) * breathPulse;
        vy += (py / dist) * breathPulse;
      }

      // Gravity well (hold = attract) / Repulsion (release)
      if (!isFinale) {
        const cdx = px - cursor.x;
        const cdy = py - cursor.y;
        const cdz = pz - cursor.z;
        const mouseDistSq = cdx * cdx + cdy * cdy + cdz * cdz;
        if (mouseDistSq < 6.0 && mouseDistSq > 0.01) {
          const strength = (6.0 - mouseDistSq) / 6.0; // falloff
          const force = strength * (isHolding ? -0.06 : 0.04);
          const invDist = 1 / Math.sqrt(mouseDistSq);
          vx += cdx * invDist * force;
          vy += cdy * invDist * force;
          vz += cdz * invDist * force;
        }
      }

      // Friction
      vx *= friction;
      vy *= friction;
      vz *= friction;

      // Integrate
      pos[i3] = px + vx;
      pos[i3 + 1] = py + vy;
      pos[i3 + 2] = pz + vz;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;

      // Color — lerp toward current or interpolated palette
      let tr: number, tg: number, tb: number;
      if (isFinale) {
        tr = 1; tg = 1; tb = 1;
      } else if (morphT > 0) {
        tr = currentPaletteColors.current[i3] + (nextPaletteColors.current[i3] - currentPaletteColors.current[i3]) * morphT;
        tg = currentPaletteColors.current[i3 + 1] + (nextPaletteColors.current[i3 + 1] - currentPaletteColors.current[i3 + 1]) * morphT;
        tb = currentPaletteColors.current[i3 + 2] + (nextPaletteColors.current[i3 + 2] - currentPaletteColors.current[i3 + 2]) * morphT;
      } else {
        tr = currentPaletteColors.current[i3];
        tg = currentPaletteColors.current[i3 + 1];
        tb = currentPaletteColors.current[i3 + 2];
      }
      const colorLerp = isFinale ? 0.02 : 0.04;
      currentColors[i3] += (tr - currentColors[i3]) * colorLerp;
      currentColors[i3 + 1] += (tg - currentColors[i3 + 1]) * colorLerp;
      currentColors[i3 + 2] += (tb - currentColors[i3 + 2]) * colorLerp;

      // Update instance transforms
      dummy.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      colorObj.setRGB(currentColors[i3], currentColors[i3 + 1], currentColors[i3 + 2]);
      meshRef.current.setColorAt(i, colorObj);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.028, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
};

// ============================================================
// MAIN APPLICATION
// ============================================================

export default function App() {
  const [restartKey, setRestartKey] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [morphProgress, setMorphProgress] = useState(0);
  const [isFinale, setIsFinale] = useState(false);
  const [finaleProgress, setFinaleProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);
  const [showAgain, setShowAgain] = useState(false);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const morphRafRef = useRef<number>(0);
  const finaleRafRef = useRef<number>(0);

  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  // Instruction text
  useEffect(() => {
    const timer = setTimeout(() => setShowInstruction(false), 6000);
    return () => clearTimeout(timer);
  }, [restartKey]);

  // Smooth morph animation using requestAnimationFrame
  const startMorph = useCallback((onComplete: () => void) => {
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / MORPH_TIME, 1);
      setMorphProgress(t);
      if (t < 1) {
        morphRafRef.current = requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };
    morphRafRef.current = requestAnimationFrame(animate);
  }, []);

  // Smooth finale convergence animation
  const startFinaleConverge = useCallback(() => {
    setIsFinale(true);
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / FINALE_CONVERGE, 1);
      setFinaleProgress(t);
      if (t < 1) {
        finaleRafRef.current = requestAnimationFrame(animate);
      } else {
        // Begin fade to black
        setIsFading(true);
        addTimeout(() => {
          setIsEnded(true);
          addTimeout(() => setShowAgain(true), FINALE_BLACK);
        }, FINALE_FADE);
      }
    };
    finaleRafRef.current = requestAnimationFrame(animate);
  }, [addTimeout]);

  // Auto-advancing countdown
  useEffect(() => {
    if (morphProgress > 0 || isFinale || isEnded) return;
    if (phaseIndex >= NUMBERS.length) return;

    const holdTimer = setTimeout(() => {
      if (phaseIndex === NUMBERS.length - 1) {
        // Last digit — hold, then converge
        addTimeout(() => startFinaleConverge(), FINALE_HOLD);
      } else {
        // Morph to next number
        startMorph(() => {
          setPhaseIndex(prev => prev + 1);
          setMorphProgress(0);
        });
      }
    }, HOLD_TIME);

    return () => clearTimeout(holdTimer);
  }, [phaseIndex, morphProgress, isFinale, isEnded, addTimeout, startMorph, startFinaleConverge]);

  // Restart
  const handleRestart = useCallback(() => {
    if (!isEnded) return;

    timeoutsRef.current.forEach(id => clearTimeout(id));
    timeoutsRef.current = [];
    cancelAnimationFrame(morphRafRef.current);
    cancelAnimationFrame(finaleRafRef.current);

    setRestartKey(k => k + 1);
    setPhaseIndex(0);
    setMorphProgress(0);
    setIsFinale(false);
    setFinaleProgress(0);
    setIsFading(false);
    setIsEnded(false);
    setShowAgain(false);
    setShowInstruction(true);
  }, [isEnded]);

  return (
    <div className="container" onClick={handleRestart}>
      <Canvas camera={{ position: [0, 0, 12], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#020205']} />

        <ParticleSwarm
          key={restartKey}
          phaseIndex={phaseIndex}
          morphProgress={morphProgress}
          isFinale={isFinale}
          finaleProgress={finaleProgress}
          isEnded={isEnded}
        />

        <EffectComposer enableNormalPass={false}>
          <Bloom
            luminanceThreshold={0.3}
            mipmapBlur
            luminanceSmoothing={0.9}
            intensity={1.2}
          />
        </EffectComposer>
      </Canvas>

      {showInstruction && (
        <div key={`instr-${restartKey}`} className="instruction">
          hold to attract · release to let go
        </div>
      )}

      <div className={`overlay${isFading ? ' fading' : ''}${isEnded ? ' ended' : ''}`} />

      {showAgain && (
        <div key={`again-${restartKey}`} className="again">
          Again?
        </div>
      )}
    </div>
  );
}
