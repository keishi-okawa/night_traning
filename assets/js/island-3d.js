import * as THREE from "../vendor/three.module.js";

/*
 * Night Flow 3D island scene.
 * Procedural PBR geometry keeps the scene self-contained and available offline
 * after the pinned Three.js modules have been cached by the service worker.
 */
const scenes = new Map();
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

function noiseTexture(base, accent, seed = 17, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < 5200; i++) {
    const alpha = 0.035 + random() * 0.15;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = random() > 0.55 ? accent : "#ffffff";
    const w = 1 + random() * 9;
    const h = 1 + random() * 7;
    ctx.fillRect(random() * size, random() * size, w, h);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const grassMap=noiseTexture('#778f60','#c7d5a0',29);
const grassBump=grassMap.clone();grassBump.colorSpace=THREE.NoColorSpace;
const rockMap=noiseTexture('#777d7e','#bec1b8',61);
const rockBump=rockMap.clone();rockBump.colorSpace=THREE.NoColorSpace;
const stoneMap=noiseTexture('#98998e','#e1d8c2',83);
const stoneBump=stoneMap.clone();stoneBump.colorSpace=THREE.NoColorSpace;
const woodMap=noiseTexture('#805538','#c69461',101);
const woodBump=woodMap.clone();woodBump.colorSpace=THREE.NoColorSpace;
const materials = {
  grass: new THREE.MeshStandardMaterial({ color: "#7f9e68", map: grassMap, bumpMap: grassBump, bumpScale: 0.075, roughness: 0.96 }),
  rock: new THREE.MeshStandardMaterial({ vertexColors: true, map: rockMap, bumpMap: rockBump, bumpScale: 0.16, roughness: 0.94 }),
  stone: new THREE.MeshStandardMaterial({ color: "#a9a89a", map: stoneMap, bumpMap: stoneBump, bumpScale: 0.09, roughness: 0.86 }),
  darkStone: new THREE.MeshStandardMaterial({ color: "#596873", roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: "#8a6040", map: woodMap, bumpMap: woodBump, bumpScale: 0.055, roughness: 0.82 }),
  copper: new THREE.MeshStandardMaterial({ color: "#9e7853", metalness: 0.72, roughness: 0.34 }),
  gold: new THREE.MeshStandardMaterial({ color: "#d6b56c", metalness: 0.68, roughness: 0.28 }),
  glass: new THREE.MeshPhysicalMaterial({ color: "#9bd8e1", roughness: 0.12, metalness: 0.12, transmission: 0.42, transparent: true, opacity: 0.5, thickness: 0.35, side: THREE.DoubleSide }),
  water: new THREE.MeshPhysicalMaterial({ color: "#71d8ed", roughness: 0.12, metalness: 0.08, transparent: true, opacity: 0.7, transmission: 0.16, side: THREE.DoubleSide }),
  leaf: new THREE.MeshStandardMaterial({ color: "#477b51", roughness: 0.9 }),
  leafLight: new THREE.MeshStandardMaterial({ color: "#83a96d", roughness: 0.92 }),
  glow: new THREE.MeshStandardMaterial({ color: "#a7edff", emissive: "#48c7ef", emissiveIntensity: 2.2, roughness: 0.25 })
};

function mesh(geometry, material, parent, position, scale) {
  const obj = new THREE.Mesh(geometry, material);
  if (position) obj.position.set(...position);
  if (scale) obj.scale.set(...scale);
  obj.castShadow = true;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}

function group(parent, position = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...position);
  parent.add(g);
  return g;
}

function cylinder(parent, radiusTop, radiusBottom, height, material, position, radial = 32) {
  return mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial, 1), material, parent, position);
}

function makeIslandBody(parent) {
  const segments = 96;
  const levels = [
    { y: 0.0, r: 11.8 },
    { y: -0.45, r: 12.2 },
    { y: -1.7, r: 10.7 },
    { y: -3.3, r: 8.1 },
    { y: -5.1, r: 5.4 },
    { y: -6.9, r: 2.5 },
    { y: -7.7, r: 0.22 }
  ];
  const vertices = [], colors = [], uvs = [], indices = [];
  for (let ring = 0; ring < levels.length; ring++) {
    const level = levels[ring];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ripple = 1 + 0.035 * Math.sin(a * 5 + ring * 0.7) + 0.025 * Math.sin(a * 11 - ring);
      const x = Math.cos(a) * level.r * ripple;
      const z = Math.sin(a) * level.r * 0.74 * ripple;
      const y = level.y + Math.sin(a * 7 + ring * 1.9) * (ring === 0 ? 0.08 : 0.18);
      vertices.push(x, y, z);
      uvs.push(i / segments, ring / (levels.length - 1));
      const t = ring / (levels.length - 1);
      const color = new THREE.Color().setHSL(0.31 - t * 0.14, 0.17 + t * 0.08, 0.52 - t * 0.23);
      colors.push(color.r, color.g, color.b);
      if (ring < levels.length - 1 && i < segments) {
        const a0 = ring * (segments + 1) + i;
        const b0 = a0 + segments + 1;
        indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const body = mesh(geo, materials.rock, parent, [0, 0, 0]);
  body.castShadow = true;
  body.receiveShadow = true;

  const top = mesh(new THREE.CircleGeometry(11.8, 96), materials.grass, parent, [0, 0.015, 0]);
  top.rotation.x = -Math.PI / 2;
  top.scale.set(1,0.74,1);
  top.receiveShadow = true;

  // Broken rock shelves under the island make its silhouette less geometric.
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const r = 7.2 + Math.sin(i * 2.7) * 2.2;
    const boulder = mesh(
      new THREE.DodecahedronGeometry(0.72 + (i % 4) * 0.18, 0),
      i % 3 ? materials.darkStone : materials.stone,
      parent,
      [Math.cos(a) * r, -2.6 - (i % 5) * 0.65, Math.sin(a) * r * 0.72],
      [1.25, 0.7 + (i % 3) * 0.15, 0.95]
    );
    boulder.rotation.set(i * 0.3, i * 0.7, i * 0.11);
  }
  return top;
}

function addWaterfall(parent, x, z, rotation = 0) {
  const geo = new THREE.PlaneGeometry(2.4, 8.2, 1, 16);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec3 p=position;
        p.x += sin(uv.y*8.0+time*1.3)*0.13 + sin(uv.y*17.0-time)*0.05;
        p.y -= mod(time*0.6+uv.y,1.0)*0.12;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main(){
        float edge=smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.76,vUv.x);
        float fade=smoothstep(0.0,0.12,vUv.y)*smoothstep(1.0,0.68,vUv.y);
        float streak=0.72+0.28*sin(vUv.x*48.0+vUv.y*28.0-time*4.0);
        gl_FragColor=vec4(0.46,0.83,0.95,edge*fade*streak*0.75);
      }`
  });
  const fall = new THREE.Mesh(geo, mat);
  fall.position.set(x, -3.4, z);
  fall.rotation.y = rotation;
  parent.add(fall);
  return mat;
}

function addTree(parent, x, z, scale = 1, variant = 0) {
  const tree = group(parent, [x, 0.13, z]);
  tree.scale.setScalar(scale);
  const trunkMat = new THREE.MeshStandardMaterial({ color: variant ? "#67503c" : "#785840", roughness: 0.92 });
  cylinder(tree, 0.22, 0.32, 2.0, trunkMat, [0, 1, 0], 12);
  const crown = group(tree, [0, 2.0, 0]);
  const leafMat = variant ? materials.leafLight : materials.leaf;
  const sizes = variant ? [[0,1.0,0,0.85],[0.55,0.55,0.08,0.62],[-0.5,0.55,-0.08,0.65],[0,0.25,0.55,0.55]] : [[0,1.05,0,0.95],[0.52,0.62,0.12,0.7],[-0.48,0.65,-0.1,0.72],[0,0.4,0.55,0.6]];
  sizes.forEach(([px,py,pz,r]) => mesh(new THREE.IcosahedronGeometry(r, 2), leafMat, crown, [px,py,pz], [1,1.08,0.92]));
  tree.userData.sway = Math.random() * Math.PI * 2;
  tree.userData.crown = crown;
  return tree;
}

function addCloud(parent, x, y, z, scale = 1) {
  const cloud = group(parent, [x, y, z]);
  const cloudMat = new THREE.MeshStandardMaterial({ color: "#eef4fb", roughness: 1, transparent: true, opacity: 0.72 });
  [[0,0,0,1.5],[1.2,0.22,0.1,1.05],[-1.05,0.12,0.25,1.0],[0.35,0.55,-0.1,0.95]].forEach(([px,py,pz,r]) => {
    mesh(new THREE.SphereGeometry(r, 20, 14), cloudMat, cloud, [px,py,pz], [1.25,0.55,0.85]);
  });
  cloud.userData.speed = 0.12 + Math.random() * 0.11;
  cloud.userData.originX = x;
  return cloud;
}

function addResearchLab(parent) {
  const g = group(parent, [-4.3, 0.2, -1.6]);
  cylinder(g, 2.3, 2.6, 0.42, materials.darkStone, [0,0.12,0], 48);
  cylinder(g, 1.86, 2.05, 0.55, materials.stone, [0,0.55,0], 40);
  cylinder(g, 1.42, 1.55, 2.25, materials.stone, [0,1.85,0], 40);
  cylinder(g, 1.52, 1.52, 0.16, materials.copper, [0,3.0,0], 40);
  // Tall arched window bays and stone buttresses.
  for (let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const px=Math.sin(a)*1.45, pz=Math.cos(a)*1.45;
    const win=mesh(new THREE.BoxGeometry(0.28,1.05,0.12), new THREE.MeshPhysicalMaterial({color:"#9ee4f5",emissive:"#2a92b6",emissiveIntensity:0.8,roughness:0.18}), g, [px,1.85,pz]);
    win.lookAt(px*1.3,1.85,pz*1.3);
    cylinder(g,0.13,0.2,2.7,materials.darkStone,[Math.sin(a)*1.52,1.85,Math.cos(a)*1.52],10);
  }
  const dome = mesh(new THREE.SphereGeometry(1.42,48,24,0,Math.PI*2,0,Math.PI/2), new THREE.MeshPhysicalMaterial({color:"#4c8fba",metalness:0.55,roughness:0.22,clearcoat:0.9,clearcoatRoughness:0.15}), g, [0,3.15,0], [1,0.78,1]);
  dome.castShadow = true;
  cylinder(g,0.12,0.12,0.75,materials.gold,[0,4.35,0],16);
  mesh(new THREE.SphereGeometry(0.23,24,16),materials.glow,g,[0,4.78,0]);
  const halo=mesh(new THREE.TorusGeometry(0.55,0.035,12,48),materials.gold,g,[0,3.9,0]);
  halo.rotation.x=Math.PI/2.7;
  g.userData.floatPhase=Math.random()*6;
  return g;
}

function addDock(parent) {
  const g=group(parent,[4.2,0.15,1.5]);
  const platform=mesh(new THREE.BoxGeometry(5.1,0.38,3.7),materials.wood,g,[0,0.25,0]);
  platform.castShadow=true;
  for(let i=0;i<13;i++){
    const plank=mesh(new THREE.BoxGeometry(0.34,0.07,3.75),materials.wood,g,[-2.28+i*0.38,0.48,0]);
    plank.rotation.y=0.005*(i%3);
  }
  for(const x of [-2.1,2.1])for(const z of [-1.35,1.35]){
    cylinder(g,0.12,0.15,2.5,materials.wood,[x,-0.4,z],12);
    const cap=mesh(new THREE.SphereGeometry(0.18,12,8),materials.gold,g,[x,0.95,z]);
  }
  // Mooring rings and a fully modeled small airship.
  for(let i=0;i<2;i++){
    const mast=cylinder(g,0.08,0.11,3.8,materials.wood,[i?1.8:-1.8,1.9,0],12);
    mast.rotation.z=i?-.08:.08;
  }
  const ship=group(g,[0.3,4.5,-0.6]);
  mesh(new THREE.SphereGeometry(1,40,24),new THREE.MeshPhysicalMaterial({color:"#d8c39d",roughness:0.48,clearcoat:0.35}),ship,[0,0.8,0],[2.35,1.12,1.1]);
  // Seams around the balloon.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    const rib=mesh(new THREE.TorusGeometry(1.0,0.018,8,48),materials.gold,ship,[0,0.8,0],[2.34,1.12,1.08]);
    rib.rotation.y=a;
  }
  const gondola=mesh(new THREE.BoxGeometry(1.65,0.42,0.78),materials.wood,ship,[0,-0.62,0]);
  for(const x of [-0.55,0.55])cylinder(ship,0.035,0.035,0.9,materials.gold,[x,-0.35,0],8);
  const tail=mesh(new THREE.BoxGeometry(0.7,0.12,0.9),materials.copper,ship,[-2.05,0.2,0]);
  tail.rotation.z=-0.25;
  ship.userData.airship=true;
  g.userData.airship=ship;
  g.userData.floatPhase=Math.random()*6;
  return g;
}

function addHabitat(parent) {
  const g=group(parent,[0.0,0.2,4.0]);
  cylinder(g,2.15,2.35,0.34,materials.darkStone,[0,0.1,0],48);
  cylinder(g,1.9,1.98,0.24,materials.stone,[0,0.39,0],48);
  const dome=mesh(new THREE.SphereGeometry(1.82,48,24,0,Math.PI*2,0,Math.PI/2),materials.glass,g,[0,0.5,0],[1,1.05,1.28]);
  // Brass ribs give the greenhouse depth and a recognizable silhouette.
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a)*1.82,0.55,Math.sin(a)*2.3),new THREE.Vector3(Math.cos(a)*1.45,2.1,Math.sin(a)*1.8),new THREE.Vector3(0,2.45,0));
    mesh(new THREE.TubeGeometry(curve,24,0.035,8,false),materials.copper,g);
  }
  cylinder(g,0.06,0.06,0.34,materials.gold,[0,2.75,0],10);
  // Plants inside the habitat.
  for(let i=0;i<9;i++){
    const a=i*2.4,r=0.65+(i%3)*0.32;
    const plant=group(g,[Math.cos(a)*r,0.55,Math.sin(a)*r]);
    cylinder(plant,0.045,0.06,0.55,materials.leaf,[0,0.25,0],8);
    for(let j=0;j<3;j++){
      const leaf=mesh(new THREE.SphereGeometry(0.26,12,8),j%2?materials.leafLight:materials.leaf,plant,[Math.sin(j*2)*0.2,0.5+j*0.12,Math.cos(j*2)*0.2],[0.35,0.12,0.7]);
      leaf.rotation.z=j*0.7;
    }
  }
  // A friendly island spirit lives inside the greenhouse.
  const pet=group(g,[0,0.62,0.2]);
  mesh(new THREE.SphereGeometry(0.55,28,20),new THREE.MeshPhysicalMaterial({color:"#a7c9a0",roughness:0.43,clearcoat:0.5}),pet,[0,0.65,0],[1,0.78,1]);
  for(const x of [-0.28,0.28]){
    mesh(new THREE.SphereGeometry(0.12,16,12),new THREE.MeshBasicMaterial({color:"#1b2d3b"}),pet,[x,0.72,0.47]);
    mesh(new THREE.ConeGeometry(0.16,0.35,12),materials.leafLight,pet,[x*1.2,1.12,0],[1,1,0.8]);
  }
  pet.userData.pet=true;
  g.userData.pet=pet;
  g.userData.floatPhase=Math.random()*6;
  return g;
}

function addRuin(parent, position) {
  const g=group(parent,position);
  cylinder(g,1.25,1.35,0.24,materials.darkStone,[0,0.12,0],32);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const pillar=cylinder(g,0.16,0.2,0.85,materials.stone,[Math.cos(a)*0.82,0.62,Math.sin(a)*0.82],10);
    pillar.rotation.z=(i%2?0.08:-0.06);
  }
  mesh(new THREE.DodecahedronGeometry(0.45,0),materials.darkStone,g,[0,0.35,0],[1.2,0.4,1.2]);
  return g;
}

function addPathAndProps(parent) {
  const pathPoints=[
    new THREE.Vector3(-2.2,0.11,-5.9),
    new THREE.Vector3(-0.8,0.12,-4.3),
    new THREE.Vector3(0.2,0.12,-2.4),
    new THREE.Vector3(1.0,0.12,-0.5),
    new THREE.Vector3(0.2,0.12,1.7)
  ];
  const curve=new THREE.CatmullRomCurve3(pathPoints);
  mesh(new THREE.TubeGeometry(curve,80,0.38,8,false),new THREE.MeshStandardMaterial({color:"#c0b89f",roughness:0.95}),parent);
  for(let i=0;i<70;i++){
    const a=Math.random()*Math.PI*2,r=7.2+Math.random()*3.7;
    const rock=mesh(new THREE.DodecahedronGeometry(0.12+Math.random()*0.28,0),i%3?materials.stone:materials.darkStone,parent,[Math.cos(a)*r,0.12,Math.sin(a)*r*0.72],[1.4,0.7,1]);
    rock.rotation.set(Math.random(),Math.random(),Math.random());
  }
}

function createEnvironmentMap(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d');
  const sky=ctx.createLinearGradient(0,0,0,512);
  sky.addColorStop(0,'#304c78');sky.addColorStop(.38,'#8ea9c4');sky.addColorStop(.68,'#f1c9a7');sky.addColorStop(1,'#627d8d');
  ctx.fillStyle=sky;ctx.fillRect(0,0,1024,512);
  const sun=ctx.createRadialGradient(710,245,8,710,245,220);
  sun.addColorStop(0,'rgba(255,239,207,0.95)');sun.addColorStop(.22,'rgba(255,221,177,0.3)');sun.addColorStop(1,'rgba(255,221,177,0)');
  ctx.fillStyle=sun;ctx.fillRect(450,0,520,512);
  for(let i=0;i<34;i++){
    const y=160+(i%9)*28,x=(i*137)%1024,w=50+(i*41)%180;
    ctx.fillStyle=i%2?'rgba(255,245,227,.055)':'rgba(38,59,85,.045)';
    ctx.beginPath();ctx.ellipse(x,y,w,7+(i%4)*3,0,0,Math.PI*2);ctx.fill();
  }
  const tex=new THREE.CanvasTexture(canvas);tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const environmentMap=createEnvironmentMap();

function createScene(el) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  let renderer;
  try {
    const compactDevice=(window.matchMedia?.("(max-width: 720px)")?.matches||navigator.deviceMemory<=4||navigator.hardwareConcurrency<=4||navigator.connection?.saveData);
    renderer=new THREE.WebGLRenderer({antialias:!compactDevice,alpha:false,powerPreference:"high-performance",failIfMajorPerformanceCaveat:false});
  } catch (error) {
    el.dataset.mounted="error";
    el.innerHTML='<img src="assets/game/island-scene.svg" alt="浮遊島のフォールバック画像" style="width:100%;height:100%;object-fit:cover"><div class="island-webgl-fallback" style="position:absolute;inset:auto 10px 10px;background:#fffdfaeb;border-radius:12px;padding:10px">この端末ではリアルタイム3Dを利用できません。画像表示に切り替えています。</div>';
    console.warn("Night Flow 3D renderer unavailable",error);
    return;
  }
  const renderScale=compactDevice?1.15:Math.min(window.devicePixelRatio||1,1.75);
  renderer.setPixelRatio(renderScale);
  renderer.setSize(el.clientWidth||800,el.clientHeight||420,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label","操作できる3D浮遊島。ドラッグで回転、ホイールまたはピンチで拡大縮小できます。");
  renderer.domElement.tabIndex=0;
  renderer.domElement.addEventListener("keydown",e=>{if(e.key==="+"||e.key==="="){radius-=2;placeCamera();}if(e.key==="-"||e.key==="_"){radius+=2;placeCamera();}});

  const scene=new THREE.Scene();
  scene.background=environmentMap;scene.backgroundBlurriness=0.12;
  scene.environment=environmentMap;scene.environmentIntensity=0.85;
  scene.fog=new THREE.Fog("#9eb2c9",30,72);
  const camera=new THREE.PerspectiveCamera(38,1,0.1,120);
  const isPreview=el.dataset.preview||"";
  const target=new THREE.Vector3(0,0.3,0);
  let radius=isPreview?25:32,theta=0.68,phi=0.93;
  function placeCamera(){
    phi=Math.max(0.42,Math.min(1.35,phi));
    radius=Math.max(17,Math.min(55,radius));
    camera.position.set(
      target.x+radius*Math.sin(phi)*Math.sin(theta),
      target.y+radius*Math.cos(phi),
      target.z+radius*Math.sin(phi)*Math.cos(theta)
    );
    camera.lookAt(target);
  }
  placeCamera();

  const hemi=new THREE.HemisphereLight("#d9e8ff","#4c5c48",2.0);
  scene.add(hemi);
  const key=new THREE.DirectionalLight("#fff0d8",3.6);
  key.position.set(-18,28,16);
  key.castShadow=true;
  const shadowSize=compactDevice?1024:2048;
  key.shadow.mapSize.set(shadowSize,shadowSize);
  key.shadow.camera.left=-24;key.shadow.camera.right=24;key.shadow.camera.top=24;key.shadow.camera.bottom=-24;
  key.shadow.bias=-0.0002;
  key.shadow.normalBias=0.02;
  scene.add(key);
  const rim=new THREE.DirectionalLight("#92c9ff",1.2);
  rim.position.set(18,10,-20);scene.add(rim);
  const warm=new THREE.PointLight("#ffd29a",45,24,2);
  warm.position.set(-1,5,4);scene.add(warm);

  const world=group(scene);
  makeIslandBody(world);
  addPathAndProps(world);
  addWaterfall(world,-8.2,-3.5,0.3);
  addWaterfall(world,8.2,-2.5,-0.3);

  // Ruin pads are visible until each branch facility is repaired.
  const buildings=[
    {id:"researchLab",pos:[-4.3,0.12,-1.6],build:addResearchLab},
    {id:"explorationDock",pos:[4.2,0.15,1.5],build:addDock},
    {id:"habitat",pos:[0,0.2,4.0],build:addHabitat}
  ];
  for(const item of buildings){
    const built=el.dataset.preview===item.id || el.dataset[item.id.toLowerCase()]==="built";
    if(built){
      item.build(world);
    }else{
      addRuin(world,item.pos);
    }
  }

  const trees=[];
  [[-8,-1,1.0,0],[-7,4,.78,1],[-5,6,.65,0],[7,-4,.82,1],[8,3,1.0,0],[5,6,.72,1],[1,-7,.72,0],[-1,7,.55,1]].forEach(args=>trees.push(addTree(world,...args)));
  const cloudMaterial=new THREE.MeshStandardMaterial({color:"#eef4fb",roughness:1,transparent:true,opacity:0.72});
  const clouds=[];
  [[-19,8,-8,1.5],[17,6,-12,1.8],[-14,4,10,1.2],[18,9,12,1.4],[0,10,-20,1.7]].forEach(([x,y,z,scale])=>clouds.push(addCloud(scene,x,y,z,scale)));

  const floaters=[];
  for(let i=0;i<24;i++){
    const r=13+Math.random()*7,a=Math.random()*Math.PI*2;
    const b=mesh(new THREE.DodecahedronGeometry(0.2+Math.random()*0.6,0),materials.darkStone,scene,[Math.cos(a)*r,-5-Math.random()*8,Math.sin(a)*r]);
    b.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
    floaters.push(b);
  }
  const dustCount=100,positions=new Float32Array(dustCount*3);
  for(let i=0;i<dustCount;i++){
    positions[i*3]=(Math.random()-.5)*25;
    positions[i*3+1]=1+Math.random()*7;
    positions[i*3+2]=(Math.random()-.5)*18;
  }
  const dustGeo=new THREE.BufferGeometry();
  dustGeo.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const dustMat=new THREE.PointsMaterial({color:"#d5f4ff",size:0.09,transparent:true,opacity:0.7,depthWrite:false});
  const dust=new THREE.Points(dustGeo,dustMat);world.add(dust);

  // Preview focuses on a specific facility; overview remains freely orbitable.
  if(isPreview==="researchLab")target.set(-4,1.3,-1.6);
  if(isPreview==="explorationDock")target.set(4,2.5,1.5);
  if(isPreview==="habitat")target.set(0,1.5,4);
  placeCamera();

  const clock=new THREE.Clock();
  let raf=0,disposed=false,drag=false,lastX=0,lastY=0,autoRotate=true;
  const onDown=e=>{if(e.pointerType==="mouse"&&e.button!==0)return;drag=true;autoRotate=false;lastX=e.clientX;lastY=e.clientY;el.setPointerCapture?.(e.pointerId);};
  const onMove=e=>{
    if(!drag||pointers.size>1)return;
    const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    theta-=dx*0.006;phi+=dy*0.004;placeCamera();
  };
  const onUp=()=>{drag=false;};
  const onWheel=e=>{e.preventDefault();radius+=e.deltaY*0.018;placeCamera();};
  renderer.domElement.addEventListener("pointerdown",onDown);
  renderer.domElement.addEventListener("pointermove",onMove);
  renderer.domElement.addEventListener("pointerup",onUp);
  renderer.domElement.addEventListener("pointercancel",onUp);
  renderer.domElement.addEventListener("wheel",onWheel,{passive:false});
  let touchStartDistance=0;
  const pointers=new Map();
  const pointerTrack=e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const pts=[...pointers.values()];touchStartDistance=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);}};
  const pointerTrackMove=e=>{if(pointers.has(e.pointerId)){pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const pts=[...pointers.values()],d=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(touchStartDistance){radius+=(touchStartDistance-d)*0.035;placeCamera();}touchStartDistance=d;}}};
  const pointerTrackUp=e=>{pointers.delete(e.pointerId);if(pointers.size<2)touchStartDistance=0;};
  renderer.domElement.addEventListener("pointerdown",pointerTrack);
  renderer.domElement.addEventListener("pointermove",pointerTrackMove);
  renderer.domElement.addEventListener("pointerup",pointerTrackUp);
  renderer.domElement.addEventListener("pointercancel",pointerTrackUp);

  const observer=new ResizeObserver(()=>{
    if(disposed)return;
    const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  });
  observer.observe(el);

  function animate(){
    if(disposed)return;
    raf=requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),0.05),t=clock.elapsedTime;
    if(!REDUCED_MOTION){
      world.position.y=Math.sin(t*0.55)*0.11;
      if(autoRotate&&!drag)world.rotation.y=Math.sin(t*0.055)*0.045;
      trees.forEach(tree=>{tree.rotation.z=Math.sin(t*1.15+tree.userData.sway)*0.045;tree.userData.crown.rotation.z=Math.sin(t*1.3+tree.userData.sway)*0.035;});
      clouds.forEach(cloud=>{cloud.position.x+=dt*cloud.userData.speed;if(cloud.position.x>28)cloud.position.x=-28;});
      floaters.forEach((b,i)=>{b.rotation.y+=dt*0.12;b.position.y+=Math.sin(t*0.35+i)*dt*0.08;});
      const dustPositions=dustGeo.attributes.position;
      for(let i=0;i<dustCount;i++){let y=dustPositions.getY(i)+dt*(0.16+(i%5)*0.025);if(y>9)y=1;dustPositions.setY(i,y);}
      dustPositions.needsUpdate=true;
      scene.traverse(o=>{if(o.material?.uniforms?.time)o.material.uniforms.time.value=t;});
    }
    renderer.render(scene,camera);
  }
  animate();

  const dispose=()=>{
    disposed=true;cancelAnimationFrame(raf);observer.disconnect();
    renderer.domElement.removeEventListener("pointerdown",onDown);
    renderer.domElement.removeEventListener("pointermove",onMove);
    renderer.domElement.removeEventListener("pointerup",onUp);
    renderer.domElement.removeEventListener("pointercancel",onUp);
    renderer.domElement.removeEventListener("wheel",onWheel);
    renderer.domElement.removeEventListener("pointerdown",pointerTrack);
    renderer.domElement.removeEventListener("pointermove",pointerTrackMove);
    renderer.domElement.removeEventListener("pointerup",pointerTrackUp);
    renderer.domElement.removeEventListener("pointercancel",pointerTrackUp);
    const sharedMaterials=new Set(Object.values(materials));
    scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>{if(!sharedMaterials.has(m)){Object.values(m).forEach(v=>{if(v&&v.isTexture)v.dispose();});m.dispose();}});}});
    renderer.dispose();renderer.domElement.remove();
  };
  scenes.set(el,dispose);
}

function mountAll() {
  for(const [el,dispose] of scenes.entries?.() || []) {
    if(!el.isConnected){dispose();scenes.delete(el);}
  }
  document.querySelectorAll("[data-island3d]").forEach(createScene);
}
window.NightFlow3D={mountAll};
mountAll();
window.dispatchEvent(new CustomEvent("nightflow-3d-ready"));
window.addEventListener("pagehide",()=>{for(const dispose of scenes.values())dispose();scenes.clear();});
