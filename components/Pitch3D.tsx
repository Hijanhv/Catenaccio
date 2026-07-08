"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/** A mown-grass pitch texture with white markings, drawn on a 2D canvas. */
function usePitchTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    const g = c.getContext("2d")!;
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? "#1E8145" : "#2AA255";
      g.fillRect(0, (i / stripes) * 1024, 1024, 1024 / stripes + 1);
    }
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = 7;
    g.strokeRect(48, 48, 928, 928); // touchlines
    g.beginPath();
    g.moveTo(48, 512);
    g.lineTo(976, 512); // halfway line
    g.stroke();
    g.beginPath();
    g.arc(512, 512, 120, 0, Math.PI * 2); // centre circle
    g.stroke();
    g.beginPath();
    g.arc(512, 512, 10, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.strokeRect(316, 48, 392, 150); // penalty boxes
    g.strokeRect(316, 826, 392, 150);
    g.strokeRect(430, 48, 164, 60); // 6-yard boxes
    g.strokeRect(430, 916, 164, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** The red football: arcs toward the goal like a struck shot, spins, then resets. */
function Ball() {
  const ref = useRef<THREE.Group>(null);
  const START_Z = 7;
  const END_Z = -12.5;
  useFrame((state) => {
    if (!ref.current) return;
    const cycle = 5.2;
    const t = (state.clock.elapsedTime % cycle) / cycle;
    // travel during the first 62% of the cycle, then rest at the start
    const travel = Math.min(1, t / 0.62);
    const eased = travel * travel * (3 - 2 * travel); // smoothstep
    const z = START_Z + (END_Z - START_Z) * eased;
    const y = 0.55 + Math.sin(eased * Math.PI) * 2.4; // parabolic hop
    ref.current.position.set(0, y, z);
    ref.current.rotation.x -= 0.22; // fast forward spin
    ref.current.rotation.y += 0.03;
  });
  return (
    <group ref={ref} position={[0, 0.55, START_Z]}>
      <mesh castShadow>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshPhysicalMaterial color="#E5342B" roughness={0.32} clearcoat={0.8} clearcoatRoughness={0.25} sheen={0.4} sheenColor="#ff8a80" />
      </mesh>
      {/* subtle white seams for a football read */}
      <mesh>
        <sphereGeometry args={[0.555, 24, 24]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function Goal({ z }: { z: number }) {
  const post = "#f4f6f8";
  return (
    <group position={[0, 0, z]}>
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 2.4, 16]} />
          <meshStandardMaterial color={post} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 7.3, 16]} />
        <meshStandardMaterial color={post} roughness={0.5} />
      </mesh>
      {/* net */}
      <mesh position={[0, 1.2, -0.7]} rotation={[0, 0, 0]}>
        <planeGeometry args={[7.2, 2.4]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.2, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.2, 0.7]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.14} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Scene() {
  const pitch = usePitchTexture();
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]} intensity={2.1} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-16, 16, 16, -16, 0.1, 40]} />
      </directionalLight>
      <pointLight position={[-8, 8, -8]} intensity={40} color="#ffe9c7" distance={40} />
      <pointLight position={[8, 8, 8]} intensity={30} color="#d6f5ff" distance={40} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 34]} />
        <meshStandardMaterial map={pitch} roughness={0.95} />
      </mesh>

      <Goal z={-13} />
      <Ball />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.35} scale={30} blur={2.4} far={8} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.6}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 2.4}
      />
      <fog attach="fog" args={["#bfe7cf", 26, 52]} />
    </>
  );
}

export default function Pitch3D() {
  return (
    <div className="h-full w-full overflow-hidden rounded-3xl">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 9, 20], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
