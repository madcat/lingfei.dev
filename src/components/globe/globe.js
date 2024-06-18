import * as THREE from "three"
import Stats from "stats.js"
import { GUI } from "dat.gui"
import TWEEN, { Tween } from "@tweenjs/tween.js"

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { LOCS1 } from "./loc.json.js"

import earthImage from "./assets/earth.png"
import bordersImage from "./assets/borders.jpg"
import beamImage from "./assets/beam.jpg"
import dotImage from "./assets/dot.png"
import countourImage from "./assets/contour.png"

let camera, scene, renderer, stats, controls, gui, sphereGeometry, backSphereGeometry, sphere, backSphere, innerSphere, pointGeometry, pointCloud, initialAlphas, locGroup, orbitGroup, locMeshes, particles

let circle, circle1, circle2

let config = {
  minCameraDistance: 10,
  maxCameraDistance: 30,
  radius: 5,
  numPoints: 15000,
  pointSize: 5.0,
  opacity: 0.3,
  circleOpacity: 0.3,
  borderOpacity: 1.0,
  backBorderOpacity: 0.6,
  selectDelay: 1000,

  initialRotationY: 0,

  zoomOneCameraDistance: 15,
  zoomOneDelta: 2.0, // zoomOneCameraDistance +- zoomOneDelta/2

  outlineTexture: earthImage.src,
  bwTexture: bordersImage.src,
  beamTexture: beamImage.src,
  dotTexture: dotImage.src,
  contourTexture: countourImage.src,

  toggleLocations: function () {
    locGroup.visible = !locGroup.visible
  },

  toggleAutoRotate: function () {
    controls.autoRotate = !controls.autoRotate
  },
}

function initStats() {
  if (stats) return
  stats = new Stats()
  stats.showPanel(0) // 0: fps, 1: ms, 2: mb, 3+: custom
  // document.body.appendChild(stats.dom);
  stats.dom.style.bottom = 0
  stats.dom.style.right = 0
  stats.dom.style.left = "auto"
  stats.dom.style.top = "auto"
}

function initGUI() {
  if (gui) return
  GUI.TEXT_CLOSED = "︿"
  GUI.TEXT_OPEN = "﹀"
  gui = new GUI({ autoPlace: true, width: 190 })
  // gui.domElement.id = 'dat-gui'
  //    const folder = gui.addFolder('Config')
  gui.add(config, "toggleLocations").name("LOC")
  gui.add(config, "toggleAutoRotate").name("ROT")
  gui
    .add(config, "opacity", 0, 1)
    .name("BODY")
    .onChange((value) => (innerSphere.material.opacity = value))
  gui
    .add(config, "circleOpacity", 0, 1)
    .name("ORBIT")
    .onChange((value) => orbitGroup.children.forEach((c) => (c.material.opacity = value)))
  gui
    .add(config, "borderOpacity", 0, 1)
    .name("BORDER")
    .onChange((value) => (sphere.material.uniforms.lineOpacity.value = value))
  gui
    .add(config, "backBorderOpacity", 0, 1)
    .name("BORDER BACK")
    .onChange((value) => (backSphere.material.uniforms.lineOpacity.value = value))
  gui
    .add(config, "pointSize", 3.0, 9.0)
    .name("DOT SIZE")
    .onChange((value) => (pointCloud.material.uniforms.pointSize.value = value))
  gui.add(config, "zoomOneCameraDistance", 12.0, 28.0).name("BORDER@")
}

function init() {
  let canvas = document.getElementById("canvas")
  let { width, height } = canvas.parentElement.getClientRects().item(0)
  console.log(canvas.parentElement.getClientRects())

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("canvas"), alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(2.0)
  renderer.setClearColor(0x000000, 0.6)

  for (var i = 0; i < 10; i++) {
    let loc = {
      t: Math.PI * Math.random() * 2,
      p: Math.PI * Math.random(),
    }
    LOCS1.push(loc)
  }

  sphereGeometry = new THREE.SphereGeometry(config.radius + 0.01, 64, 64)
  sphereGeometry.computeBoundingBox()
  const textureLoader = new THREE.TextureLoader()

  let material = null

  let contourTexture = textureLoader.load(config.contourTexture)
  textureLoader.load(config.outlineTexture, function (texture) {
    texture.needsUpdate = true
    texture.anisotropy = 16

    material = new THREE.ShaderMaterial({
      uniforms: {
        alphaTexture: { value: texture },
        contourTexture: { value: contourTexture },
        lineOpacity: { value: config.borderOpacity },
        zoom: { value: 0 }, // 0 - contour, 1 - border, between - mix
      },
      vertexShader: `
                varying vec2 vUv;
    
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: `
                precision highp float;
                uniform sampler2D alphaTexture;
                uniform sampler2D contourTexture;
                uniform float lineOpacity;
                uniform float zoom;
                varying vec2 vUv;
    
                void main() {
                    vec4 color = texture2D(alphaTexture, vUv);
                    vec4 color1 = texture2D(contourTexture, vUv);
                    // if zoom is 0 alpha is from color.r, if zoom is 1 alpha is from color1.r, between - mix
                    float alpha = mix(color.r, color1.r, zoom);
                    gl_FragColor = vec4(1,1,1, alpha * lineOpacity ); // Use the red channel as the alpha value
                }
            `,
      transparent: true, // Enable transparency
      side: THREE.FrontSide,
      // side: THREE.DoubleSide
      // cullFace: THREE.CullFaceNone,
      // blending: THREE.AdditiveBlending

      // alphaTest: 1
      //depthWrite: false
    })

    // sphere = new THREE.Mesh(sphereGeometry, basicMaterial);
    sphere = new THREE.Mesh(sphereGeometry, material)
    sphere.renderForceSinglePass = false
    // sphere.flipSided = false
    // sphere.DoubleSided = true
    // sphere.renderOrder = 1;

    let innerSphereGeometry = new THREE.SphereGeometry(config.radius - 0.1, 32, 32)
    let innerSphereMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true })
    innerSphereMaterial.opacity = config.opacity
    innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial)

    innerSphere.renderOrder = 1
    sphere.renderOrder = 2
    sphere.rotateY(config.initialRotationY)

    scene.add(innerSphere)
    scene.add(sphere)

    let outterSphereGeometry = new THREE.SphereGeometry(6 - 0.1, 32, 32)
    let outterSphereMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true })
    outterSphereMaterial.opacity = 0.2
    let outterSphere = new THREE.Mesh(outterSphereGeometry, outterSphereMaterial)

    outterSphere.renderOrder = 3
    // scene.add(outterSphere);

    textureLoader.load(config.bwTexture, function (texture) {
      sampleAndAddPoints(texture)
    })
  })

  backSphereGeometry = new THREE.SphereGeometry(config.radius + 0.01, 64, 64)
  backSphereGeometry.computeBoundingBox()

  let material1 = new THREE.ShaderMaterial({
    uniforms: {
      alphaTexture: { value: contourTexture },
      lineOpacity: { value: config.backBorderOpacity },
    },
    vertexShader: `
                varying vec2 vUv;
    
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
    fragmentShader: `
                precision highp float;
                uniform sampler2D alphaTexture;
                varying vec2 vUv;
                uniform float lineOpacity;
    
                void main() {
                    vec4 color = texture2D(alphaTexture, vUv);
                    gl_FragColor = vec4(1,1,1, color.r * lineOpacity ); // Use the red channel as the alpha value
                }
            `,
    transparent: true, // Enable transparency
    side: THREE.BackSide,
  })

  // sphere = new THREE.Mesh(sphereGeometry, basicMaterial);
  backSphere = new THREE.Mesh(backSphereGeometry, material1)
  backSphere.renderForceSinglePass = false
  // sphere.flipSided = false
  // sphere.DoubleSided = true
  // sphere.renderOrder = 1;
  backSphere.rotateY(config.initialRotationY)
  scene.add(backSphere)

  camera.position.y = 0.01
  camera.position.x = -10
  camera.position.z = -10

  camera.lookAt(0, 0, 0)
  camera.position.setLength(config.minCameraDistance + (config.maxCameraDistance - config.minCameraDistance) * 0.25)

  // scene.fog = new THREE.Fog(0x000000, 1, 18);
  // scene.background = new THREE.Color(0x000000);

  controls = new OrbitControls(camera, renderer.domElement, sphere)
  controls.target = new THREE.Vector3(0, 0, 0)
  // controls.minDistance = 10;
  controls.enableDamping = true
  controls.minDistance = config.minCameraDistance
  controls.enableZoom = true
  controls.enablePan = false
  controls.maxDistance = config.maxCameraDistance
  controls.autoRotate = true
  controls.autoRotateSpeed = 1.0
  controls.update()
}

function generateSpherePoints(numPoints, radius) {
  const points = []
  const inc = Math.PI * (3 - Math.sqrt(5)) // Golden angle increment

  for (let i = 0; i < numPoints; i++) {
    const y = 1 - (i / (numPoints - 1)) * 2 // Map i to the range [-1, 1]
    const theta = i * inc // Calculate the θ angle using the golden angle increment
    const phi = Math.acos(y) // Calculate the φ angle using the mapped value

    const x = radius * Math.sin(phi) * Math.cos(theta)
    const z = radius * Math.sin(phi) * Math.sin(theta)

    points.push(new THREE.Vector3(x, y * radius, z))
  }

  return points
}

function sampleAndAddPoints(texture) {
  const points = generateSpherePoints(config.numPoints, config.radius + 0.01)

  let img = texture.image
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  context.drawImage(img, 0, 0, img.width, img.height)

  // Function to sample texture color based on UV position
  function sampleTextureColor(u, v) {
    // Convert UV coordinates to image pixel coordinates
    const uPixel = Math.floor(u * texture.image.width)
    const vPixel = Math.floor(v * texture.image.height)

    // Sample the texture color at the UV position
    const pixelData = context.getImageData(uPixel, vPixel, 1, 1).data
    const texColor = new THREE.Color().fromArray(pixelData)
    return texColor
  }

  let keptPoints = 0
  for (var i = 0; i < points.length; i++) {
    let point = points[i]

    let theta = Math.acos(point.y / config.radius) // θ angle
    const phi = -Math.atan2(point.z, point.x) // φ angle

    // Handle special case when point is at the pole
    if (Number.isNaN(theta)) {
      theta = point.y > 0 ? 0 : Math.PI // Set theta to 0 for top pole, π for bottom pole
    }

    // Calculate the UV coordinates for the point based on spherical coordinates
    const u = (phi + Math.PI) / (2 * Math.PI) // Map φ to the range [0, 1]
    const v = theta / Math.PI // Map θ to the range [0, 1]

    // Sample the texture color at the UV position
    const texColor = sampleTextureColor(u, v)

    // You can check for any specific color, e.g., black (rgb: 0, 0, 0)
    const blackThreshold = 0.1 // Adjust the threshold for color detection
    if (texColor.r < blackThreshold && texColor.g < blackThreshold && texColor.b < blackThreshold) {
      keptPoints++
    } else {
      points[i] = null
    }
  }

  let remainingPoints = points.filter((p) => p)
  // console.log(keptPoints, points.length)

  let alphas = new Float32Array(remainingPoints.length * 1)
  const colors = new Float32Array(remainingPoints.length * 3)
  for (let i = 0; i < remainingPoints.length; i++) {
    alphas[i] = 0.4 + 0.2 * Math.random()

    colors[i * 3 + 0] = 0.0
    colors[i * 3 + 1] = 1.0
    colors[i * 3 + 2] = 0.0
  }

  initialAlphas = new Float32Array(remainingPoints.length * 1)
  initialAlphas.set(alphas)

  pointGeometry = new THREE.BufferGeometry().setFromPoints(remainingPoints)
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  pointGeometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1))
  pointGeometry.computeBoundingBox()

  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      pointSize: { value: config.pointSize },
    },
    vertexShader: `
            attribute float alpha;
            varying float vAlpha;
            uniform float pointSize;

            void main() {
                vAlpha = alpha;
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                gl_PointSize = pointSize * ( 10.0 / -mvPosition.z );
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
    fragmentShader: `
            uniform vec3 color;
            varying float vAlpha;

            void main() {
                gl_FragColor = vec4( color, vAlpha );
            }
        `,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  })

  pointCloud = new THREE.Points(pointGeometry, shaderMaterial)
  pointCloud.renderForceSinglePass = false
  pointCloud.renderOrder = 3
  pointCloud.rotateY(config.initialRotationY)
  scene.add(pointCloud)

  particles = addParticles(7, 12, 400)
  scene.add(particles)

  circle = addCircle(5.5, Math.PI / 4)
  circle1 = addCircle(5.5, Math.PI * 1.25)
  circle2 = addCircle(5.5, Math.PI * 1.8)

  orbitGroup = new THREE.Group()
  orbitGroup.add(circle)
  orbitGroup.add(circle1)
  orbitGroup.add(circle2)
  scene.add(orbitGroup)

  locGroup = new THREE.Group()
  locGroup.renderOrder = 3

  for (var i = 0; i < LOCS1.length; i++) {
    let loc = addLocation(LOCS1[i], config.radius + 0.01)
    locGroup.add(loc)
  }

  locGroup.rotateY(config.initialRotationY)
  scene.add(locGroup)

  window.addEventListener("keyup", function (e) {
    // console.log(e.code)
    if (e.code === "Space") {
      locGroup.visible = !locGroup.visible
    } else if (e.code === "KeyR") {
      controls.autoRotate = !controls.autoRotate
    }
  })
}

function addLocation(loc, radius) {
  // const radius = 10; // Radius of the sphere
  // const theta = Math.PI / 4; // Theta angle in radians
  // const phi = Math.PI / 6; // Phi angle in radians
  const scale = 0.3 // Scale factor for the square
  const theta = loc.t
  const phi = loc.p

  const r = radius + 0.1
  // Calculate the 3D position of the square's origin on the sphere
  const x = r * Math.sin(phi) * Math.cos(theta)
  const y = r * Math.cos(phi)
  const z = r * Math.sin(phi) * Math.sin(theta)

  // Create the square geometry with sides of length 1
  const squareGeometry = new THREE.PlaneGeometry(1, 1)

  let color = loc.more ? 0xffeb14 : 0xffffff

  // Calculate the normal vector of the square's geometry
  const normal = new THREE.Vector3(x, y, z).normalize()

  // Optionally, you can create a mesh to visualize the square
  const squareTexture = new THREE.TextureLoader().load(config.dotTexture)
  const squareMaterial = new THREE.MeshBasicMaterial({ map: squareTexture, transparent: true, color: new THREE.Color(color), side: THREE.DoubleSide })
  const squareMesh = new THREE.Mesh(squareGeometry, squareMaterial)
  // Set the position of the square's origin on the sphere
  squareMesh.lookAt(normal) // Orient the square's normal along the line from the sphere's origin to the square's origin
  const rot = squareMesh.rotation
  squareMesh.position.set(x, y, z)
  squareMesh.scale.set(scale, scale, 1) // Scale the square

  const planeTexture = new THREE.TextureLoader().load(config.beamTexture)
  const planeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      alphaTexture: { value: planeTexture },
      newColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
    fragmentShader: `
            precision highp float;
            uniform sampler2D alphaTexture;
            uniform vec3 newColor;
            varying vec2 vUv;

            void main() {
                vec4 color = texture2D(alphaTexture, vUv);
                gl_FragColor = vec4(newColor.x, newColor.y, newColor.z, color.r * 0.9 ); // Use the red channel as the alpha value
            }
        `,
    transparent: true, // Enable transparenc
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
  })

  const planeHeight = 3.0
  const planeGeometryX = new THREE.PlaneGeometry(1, planeHeight)
  const planeGeometryY = new THREE.PlaneGeometry(1, planeHeight)

  // const planeMaterial = new THREE.MeshBasicMaterial({ map: planeTexture, transparent: true, side: THREE.DoubleSide });
  const planeMeshX = new THREE.Mesh(planeGeometryX, planeMaterial)
  const planeMeshY = new THREE.Mesh(planeGeometryY, planeMaterial)

  planeGeometryX.translate(0, -planeHeight / 2, 0)
  planeMeshX.lookAt(normal)
  planeMeshX.rotateX(-Math.PI / 2)
  planeMeshX.rotateY(Math.PI / 2)
  planeMeshX.position.copy(squareMesh.position)
  planeMeshX.scale.set(scale, scale, 1)

  planeGeometryY.translate(0, -planeHeight / 2, 0)
  planeMeshY.lookAt(normal)
  planeMeshY.rotateX(-Math.PI / 2)
  planeMeshY.position.copy(squareMesh.position)
  planeMeshY.scale.set(scale, scale, 1)

  const lightGroup = new THREE.Group()
  lightGroup.add(planeMeshX)
  lightGroup.add(planeMeshY)

  const group = new THREE.Group()
  group.add(squareMesh)

  if (!locMeshes) {
    locMeshes = []
  }
  locMeshes.push(squareMesh)
  squareMesh.callback = function () {
    moveCamera(theta, phi)
  }
  group.add(lightGroup)

  return group
}

function addCircle(radius, theta) {
  const curve = new THREE.EllipseCurve(
    0,
    0, // x, y
    radius,
    radius, // xRadius, yRadius
    0,
    2 * Math.PI, // startAngle, endAngle
    false, // clockwise
    0 // rotation
  )
  const points = curve.getPoints(64)
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, linewidth: 10 })
  material.opacity = config.circleOpacity
  const line = new THREE.Line(geometry, material)
  line.position.set(0, 0, 0)
  line.rotation.x = theta
  return line
}

// spherical random particles
function addParticles(minRadius, maxRadius, count) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const rotations = new Float32Array(count * 3)
  const rotationSpeeds = new Float32Array(count * 3)
  const alphas = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    let position, distance
    do {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      const r = minRadius + Math.random() * (maxRadius - minRadius)
      position = sphericalToCartesian(r, theta, phi)
      distance = position.length()
    } while (distance < minRadius || distance > maxRadius)

    positions[i * 3] = position.x
    positions[i * 3 + 1] = position.y
    positions[i * 3 + 2] = position.z

    const rotationSpeed = (maxRadius - distance) / maxRadius
    rotations[i * 3] = Math.random() * Math.PI * 2
    rotations[i * 3 + 1] = Math.random() * Math.PI * 2
    rotations[i * 3 + 2] = Math.random() * Math.PI * 2
    rotationSpeeds[i * 3 + 2] = rotationSpeed

    alphas[i] = Math.random() * 0.4 + 0.4
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("rotation", new THREE.BufferAttribute(rotations, 3))
  geometry.setAttribute("rotationSpeed", new THREE.BufferAttribute(rotationSpeeds, 3))
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1))
  const material = new THREE.PointsMaterial({ color: 0xaabbff, size: 0.1, transparent: true, alphaTest: 0.01, opacity: 0.5 })
  const particles = new THREE.Points(geometry, material)

  return particles
}

function sphericalToCartesian(radius, theta, phi) {
  let x, y, z
  if (theta === 0) {
    x = 0
    y = radius * Math.cos(phi)
    z = 0
  } else {
    x = radius * Math.sin(phi) * Math.cos(theta)
    y = radius * Math.cos(phi)
    z = radius * Math.sin(phi) * Math.sin(theta)
  }
  return new THREE.Vector3(x, y, z)
}

function cartesianToSpherical(x, y, z) {
  const radius = Math.sqrt(x * x + y * y + z * z)
  const theta = Math.atan2(z, x)
  const phi = Math.atan2(y, Math.sqrt(x * x + z * z))
  return { radius, theta, phi }
}

let isAnimatingCamera = false
let tween = null

function moveCamera(t, p) {
  isAnimatingCamera = true

  let r = camera.position.distanceTo(new THREE.Vector3(0, 0, 0))

  let oldPos = camera.position.clone()
  if (oldPos.x == 0) {
    oldPos.x += Math.sign(oldPos.y) * 0.001
  }
  let newPos = sphericalToCartesian(r, t, p)
  const distance = oldPos.distanceTo(newPos)

  tween = new TWEEN.Tween({ t: 0 })
    .to({ t: 1 }, 1000)
    .onUpdate(() => {
      const direction = new THREE.Vector3().subVectors(newPos, oldPos).normalize()
      const position = oldPos.clone().add(direction.multiplyScalar(distance * tween._object.t))
      camera.position.copy(position)
      camera.lookAt(0, 0, 0)
    })
    .easing(TWEEN.Easing.Exponential.Out)
    .onComplete(() => {
      isAnimatingCamera = false
    })
    .start()
}

function selectLOC(pos) {
  var raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pos, camera)
  var intersects = raycaster.intersectObjects(locMeshes)

  if (intersects.length > 0) {
    // console.log(intersects[0].object)
    controls.autoRotate = false
    setTimeout(intersects[0].object.callback, config.selectDelay)
    // intersects[1].object.callback();
  }
}

function setupSelectLocation() {
  var mouse = new THREE.Vector2()

  window.addEventListener(
    "click",
    function (e) {
      //e.preventDefault();
      mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1
      mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1
      selectLOC(mouse)
    },
    false
  )

  window.addEventListener("touchend", function (e) {
    //e.preventDefault();
    mouse.x = (e.changedTouches[0].clientX / renderer.domElement.clientWidth) * 2 - 1
    mouse.y = -(e.changedTouches[0].clientY / renderer.domElement.clientHeight) * 2 + 1
    selectLOC(mouse)
  })
}

let clock = new THREE.Clock()
let time = 0

function render() {
  requestAnimationFrame(render)

  stats.begin()
  //sphere.rotation.x += 0.01;
  //sphere.rotation.y += 0.01;

  // if (pointGeometry) {
  //     let alphaAttrs = pointGeometry.attributes.alpha;
  //     var count = alphaAttrs.count;

  //     for (var i = 0; i < count; i++) {
  //         alphaAttrs.array[i] *= 0.995
  //         if (alphaAttrs.array[i] < 0.01) alphaAttrs.array[i] = 1.0
  //     }

  //     alphaAttrs.needsUpdate = true;
  // // }
  time += clock.getDelta()
  const angle = Math.PI / 360

  if (pointGeometry && initialAlphas) {
    let currentAlphas = pointGeometry.attributes.alpha.array
    for (let i = 0; i < currentAlphas.length; i++) {
      // animate alpha between initial to 0.7
      currentAlphas[i] = initialAlphas[i] - 0.1 + 0.2 * Math.sin(time * 2.0 + i * 0.1)
    }
    pointGeometry.attributes.alpha.needsUpdate = true
  }

  // if (particles) {
  //     particles.geometry.attributes.position.array.forEach((position, index) => {
  //         const distance = Math.sqrt(position ** 2 + (position + 1) ** 2 + position ** 2);
  //         const rotationSpeed = (10 - distance) / 10;
  //         const vector = new THREE.Vector3(position, position + 1, position);
  //         vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle * rotationSpeed);
  //         particles.geometry.attributes.position.array[index * 3] = vector.x;
  //         particles.geometry.attributes.position.array[index * 3 + 1] = vector.y - 1;
  //         particles.geometry.attributes.position.array[index * 3 + 2] = vector.z;
  //     });
  //     particles.geometry.attributes.position.needsUpdate = true;
  // }

  if (circle) {
    circle.rotation.y += angle / 6
    circle1.rotation.y += angle / 9
    circle2.rotation.y += angle / 12
  }

  if (sphere) {
    let dist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0))
    if (dist < config.zoomOneCameraDistance - config.zoomOneDelta / 2.0) {
      sphere.material.uniforms.zoom.value = 0
    } else if (dist > config.zoomTwoCameraDistance + config.zoomTwoDelta / 2.0) {
      sphere.material.uniforms.zoom.value = 1
    } else {
      let p = (dist - config.zoomOneCameraDistance + config.zoomOneDelta / 2.0) / config.zoomOneDelta
      sphere.material.uniforms.zoom.value = p
    }
  }

  TWEEN.update()
  controls.update()
  renderer.render(scene, camera)
  stats.end()
}

initStats()
init()
initGUI()
setupSelectLocation()
render()
