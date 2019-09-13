// Copyright (c) 2018 8th Wall, Inc.

// Returns a pipeline module that initializes the threejs scene when the camera feed starts, and
// handles subsequent spawning of a glb model whenever the scene is tapped.
const placegroundScenePipelineModule = () => {
  // 3D model to spawn at tap
  const modelFiles = [ 'assets/SendagayaShibu.vrm', 'assets/SendagayaShino.vrm' ];
  // 別のgltfからモーションを借用
  // http://examples.claygl.xyz/examples/basicModelAnimation.html
  const animationFiles = [ 'assets/SambaDancing.gltf' ];

  const startScale = new THREE.Vector3(0.0001, 0.0001, 0.0001) // Initial scale value for our model
  const endScale = new THREE.Vector3(0.002, 0.002, 0.002)      // Ending scale value for our model
  const animationMillis = 750                                  // Animate over 0.75 seconds

  const raycaster = new THREE.Raycaster()
  const tapPosition = new THREE.Vector2()
  const loader = new THREE.VRMLoader()
  const animationLoader = new THREE.GLTFLoader();

  for(let i = 0; i < modelFiles.length; ++i){
    loader.load(modelFiles[i], function() { alert('Model ' + i + ' loaded.') });
  }
  for(let i = 0; i < animationFiles.length; ++i){
    animationLoader.load(animationFiles[i], function() { alert('Animation ' + i + ' loaded.') });
  }

  let surface  // Transparent surface for raycasting for object placement.

  // Populates some object into an XR scene and sets the initial camera position. The scene and
  // camera come from xr3js, and are only available in the camera loop lifecycle onStart() or later.
  const initXrScene = ({ scene, camera }) => {
    console.log('initXrScene')
    surface = new THREE.Mesh(
      new THREE.PlaneGeometry( 100, 100, 1, 1 ),
      new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      })
    )

    surface.rotateX(-Math.PI / 2)
    surface.position.set(0, 0, 0)
    scene.add(surface)

    scene.add(new THREE.AmbientLight( 0x404040, 5 ))  // Add soft white light to the scene.

    // Set the initial camera position relative to the scene we just laid out. This must be at a
    // height greater than y=0.
    camera.position.set(0, 3, 0)
  }

  const animateIn = (model, pointX, pointZ, yDegrees) => {
    console.log(`animateIn: ${pointX}, ${pointZ}, ${yDegrees}`)
    const scale = Object.assign({}, startScale)
    loadModelIndex = (loadModelIndex + 1) % modelFiles.length;

    const scale = { x: startScale.x, y: startScale.y, z: startScale.z }

    model.scene.name = "VRM";
    //model.scene.rotation.set(0.0, yDegrees, 0.0)
    model.scene.rotation.set( 0.0, Math.PI, 0.0 )
    model.scene.position.set( pointX, 0.0, pointZ )
    model.scene.scale.set( scale.x, scale.y, scale.z )

    // VRMLoader doesn't support VRM Unlit extension yet so
    // converting all materials to MeshBasicMaterial here as workaround so far.
    model.scene.traverse((object) => {
     if ( object.material ) {
        if ( Array.isArray( object.material ) ) {
          for ( var i = 0, il = object.material.length; i < il; i ++ ) {
            var material = new THREE.MeshBasicMaterial();
            THREE.Material.prototype.copy.call( material, object.material[ i ] );
            material.color.copy( object.material[ i ].color );
            material.map = object.material[ i ].map;
            material.lights = false;
            material.skinning = object.material[ i ].skinning;
            material.morphTargets = object.material[ i ].morphTargets;
            material.morphNormals = object.material[ i ].morphNormals;
            object.material[ i ] = material;
         }
        } else {
          var material = new THREE.MeshBasicMaterial();
          THREE.Material.prototype.copy.call( material, object.material );
          material.color.copy( object.material.color );
          material.map = object.material.map;
          material.lights = false;
          material.skinning = object.material.skinning;
          material.morphTargets = object.material.morphTargets;
          material.morphNormals = object.material.morphNormals;
          object.material = material;
        }
      }
    });

    //表情のブレンドシェイプ
    let morphTarget = model.scene.getObjectByName( "Face", true );
    morphTarget.morphTargetInfluences[1] = 1.0;

    //scene.add(model.scene)
    XR.Threejs.xrScene().scene.add(model.scene)

    //アニメーションの紐付け
    let mixer = new THREE.AnimationMixer(model.scene);
    animationLoader.load( animationFiles[loadAnimationIndex], function( gltf ){
      loadAnimationIndex = (loadAnimationIndex + 1) % animationFiles.length;

      const animations = gltf.animations;
      if( animations && animations.length ){
        for( let animation of animations ){
          correctBoneName( animation.tracks );
          correctCoordinate( animation.tracks );
          mixer.clipAction( animation ).play();
        }
      }
    });
    mixers.push( mixer );

    new TWEEN.Tween(scale)
      .to(endScale, animationMillis)
      .easing(TWEEN.Easing.Elastic.Out) // Use an easing function to make the animation smooth.
      .onUpdate(() => { model.scene.scale.set(scale.x, scale.y, scale.z) })
      .start() // Start the tween immediately.
  }

  // Load the glb model at the requested point on the surface.
  const placeObject = (pointX, pointZ) => {
    console.log(`placing at ${pointX}, ${pointZ}`)
    loader.load(
      modelFile,                                                              // resource URL.
      (vrm) => {animateIn(vrm, pointX, pointZ, Math.random() * 360)},         // loaded handler.
      (xhr) => {console.log(`${(xhr.loaded / xhr.total * 100 )}% loaded`)},   // progress handler.
      (error) => {console.log('An error happened')}                           // error handler.
    )
  }

  const placeObjectTouchHandler = (e) => {
    console.log('placeObjectTouchHandler')
    // Call XrController.recenter() when the canvas is tapped with two fingers. This resets the
    // AR camera to the position specified by XrController.updateCameraProjectionMatrix() above.
    if (e.touches.length == 2) {
      XR.XrController.recenter()
    }

    if (e.touches.length > 2) {
      return
    }

    // If the canvas is tapped with one finger and hits the "surface", spawn an object.
    const {scene, camera} = XR.Threejs.xrScene()

    // calculate tap position in normalized device coordinates (-1 to +1) for both components.
    tapPosition.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1
    tapPosition.y = - (e.touches[0].clientY / window.innerHeight) * 2 + 1

    // Update the picking ray with the camera and tap position.
    raycaster.setFromCamera(tapPosition, camera)

    // Raycast against the "surface" object.
    const intersects = raycaster.intersectObject(surface)

    if (intersects.length == 1 && intersects[0].object == surface) {
      placeObject(intersects[0].point.x, intersects[0].point.z)
    }
  }

  return {
    // Pipeline modules need a name. It can be whatever you want but must be unique within your app.
    name: 'placeground',

    // onStart is called once when the camera feed begins. In this case, we need to wait for the
    // XR.Threejs scene to be ready before we can access it to add content. It was created in
    // XR.Threejs.pipelineModule()'s onStart method.
    onStart: ({canvas, canvasWidth, canvasHeight}) => {
      const {scene, camera} = XR.Threejs.xrScene()  // Get the 3js sceen from xr3js.

      initXrScene({ scene, camera }) // Add objects to the scene and set starting camera position.

      canvas.addEventListener('touchstart', placeObjectTouchHandler, true)  // Add touch listener.

      // Enable TWEEN animations.
      animate()
      function animate(time) {
        requestAnimationFrame(animate)
        TWEEN.update(time)

        //アニメーションの更新
        let delta = clock.getDelta();
        for (let i = 0, len = mixers.length; i < len; ++i) {
          mixers[i].update(delta);
        }
      }

      // Sync the xr controller's 6DoF position and camera paremeters with our scene.
      XR.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      })
    },
  }
}

//Mixamo用からVRoid用にボーン名を変更
//bvhなども同様にボーン名を変更すればモーションを反映できる
const correctBoneName = (tracks) => {
  const positions = new Map([
    ["mixamorigHips", "J_Bip_C_Hips"],
  ]);
  const quaternions = new Map([
    ["mixamorigHips",             "J_Bip_C_Hips"],
    ["mixamorigSpine",            "J_Bip_C_Spine"],
    ["mixamorigSpine1",           "J_Bip_C_Chest"],
    ["mixamorigSpine2",           "J_Bip_C_UpperChest"],
    ["mixamorigNeck",             "J_Bip_C_Neck"],
    ["mixamorigHead",             "J_Bip_C_Head"],
    ["mixamorigRightUpLeg",       "J_Bip_R_UpperLeg"],	["mixamorigLeftUpLeg",       "J_Bip_L_UpperLeg"],
    ["mixamorigRightLeg",         "J_Bip_R_LowerLeg"],	["mixamorigLeftLeg",         "J_Bip_L_LowerLeg"],
    ["mixamorigRightFoot",        "J_Bip_R_Foot"],	["mixamorigLeftFoot",        "J_Bip_L_Foot"],
    ["mixamorigRightToeBase",     "J_Bip_R_ToeBase"],	["mixamorigLeftToeBase",     "J_Bip_L_ToeBase"],
    ["mixamorigRightShoulder",    "J_Bip_R_Shoulder"],	["mixamorigLeftShoulder",    "J_Bip_L_Shoulder"],
    ["mixamorigRightArm",         "J_Bip_R_UpperArm"],	["mixamorigLeftArm",         "J_Bip_L_UpperArm"],
    ["mixamorigRightForeArm",     "J_Bip_R_LowerArm"],	["mixamorigLeftForeArm",     "J_Bip_L_LowerArm"],
    ["mixamorigRightHand",        "J_Bip_R_Hand"],	["mixamorigLeftHand",        "J_Bip_L_Hand"],
    ["mixamorigRightHandMiddle1", "J_Bip_R_Middle1"],	["mixamorigLeftHandMiddle1", "J_Bip_L_Middle1"],
    ["mixamorigRightHandMiddle2", "J_Bip_R_Middle2"],	["mixamorigLeftHandMiddle2", "J_Bip_L_Middle2"],
    ["mixamorigRightHandMiddle3", "J_Bip_R_Middle3"],	["mixamorigLeftHandMiddle3", "J_Bip_L_Middle3"],
    ["mixamorigRightHandIndex1",  "J_Bip_R_Index1"],	["mixamorigLeftHandIndex1",  "J_Bip_L_Index1"],
    ["mixamorigRightHandIndex2",  "J_Bip_R_Index2"],	["mixamorigLeftHandIndex2",  "J_Bip_L_Index2"],
    ["mixamorigRightHandIndex3",  "J_Bip_R_Index3"],	["mixamorigLeftHandIndex3",  "J_Bip_L_Index3"],
    ["mixamorigRightHandPinky1",  "J_Bip_R_Little1"],	["mixamorigLeftHandPinky1",  "J_Bip_L_Little1"],
    ["mixamorigRightHandPinky2",  "J_Bip_R_Little2"],	["mixamorigLeftHandPinky2",  "J_Bip_L_Little2"],
    ["mixamorigRightHandPinky3",  "J_Bip_R_Little3"],	["mixamorigLeftHandPinky3",  "J_Bip_L_Little3"],
    ["mixamorigRightHandThumb1",  "J_Bip_R_Thumb1"],	["mixamorigLeftHandThumb1",  "J_Bip_L_Thumb1"],
    ["mixamorigRightHandThumb2",  "J_Bip_R_Thumb2"],	["mixamorigLeftHandThumb2",  "J_Bip_L_Thumb2"],
    ["mixamorigRightHandThumb3",  "J_Bip_R_Thumb3"],	["mixamorigLeftHandThumb3",  "J_Bip_L_Thumb3"],
    ["mixamorigRightHandRing1",   "J_Bip_R_Ring1"],	["mixamorigLeftHandRing1",   "J_Bip_L_Ring1"],
    ["mixamorigRightHandRing2",   "J_Bip_R_Ring2"],	["mixamorigLeftHandRing2",   "J_Bip_L_Ring2"],
    ["mixamorigRightHandRing3",   "J_Bip_R_Ring3"],	["mixamorigLeftHandRing3",   "J_Bip_L_Ring3"],
  ]);

  for(const [key, value] of positions){
    tracks.find((obj) => { return obj.name === `${key}.position`; }).name = `${value}.position`;
  }
  for(const [key, value] of quaternions){
    tracks.find((obj) => { return obj.name === `${key}.quaternion`; }).name = `${value}.quaternion`;
  }
}
//Mixamo用からVRoid用にトラックの値を変更
const correctCoordinate = (tracks) => {
  for(let track of tracks){
    //const track = tracks[j];
    const index = track.name.indexOf(".");
    const ext = track.name.slice(index + 1);
    if(ext == "quaternion"){
      for(let k = 0; k < track.values.length; k+=4){
        track.values[k + 1] = -track.values[k + 1];
        track.values[k + 3] = -track.values[k + 3];
      }
    }else if(ext == "position"){
      for(let k = 0; k < track.values.length; k+=3){
        track.values[k] *= -0.01;
        track.values[k + 1] *= 0.01;
        track.values[k + 2] *= -0.01;
      }
    }
  }
}

const onxrloaded = () => {
  XR.addCameraPipelineModules([  // Add camera pipeline modules.
    // Existing pipeline modules.
    XR.GlTextureRenderer.pipelineModule(),       // Draws the camera feed.
    XR.Threejs.pipelineModule(),                 // Creates a ThreeJS AR Scene.
    XR.XrController.pipelineModule(),            // Enables SLAM tracking.
    XRExtras.AlmostThere.pipelineModule(),       // Detects unsupported browsers and gives hints.
    XRExtras.FullWindowCanvas.pipelineModule(),  // Modifies the canvas to fill the window.
    XRExtras.Loading.pipelineModule(),           // Manages the loading screen on startup.
    XRExtras.RuntimeError.pipelineModule(),      // Shows an error image on runtime error.
    // Custom pipeline modules.
    placegroundScenePipelineModule(),
  ])

  // Open the camera and start running the camera run loop.
  XR.run({canvas: document.getElementById('camerafeed')})
}

// Show loading screen before the full XR library has been loaded.
const load = () => { XRExtras.Loading.showLoading({onxrloaded}) }
window.onload = () => { window.XRExtras ? load() : window.addEventListener('xrextrasloaded', load) }
