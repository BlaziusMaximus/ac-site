import React from 'react';
import ReactDOM from 'react-dom';

import { vec3, mat4, quat } from 'gl-matrix';

import WebXRPolyfill from 'webxr-polyfill';

// import 

const polyfill = new WebXRPolyfill({

});

const xRotationDegreesPerSecond = 25;
const yRotationDegreesPerSecond = 15;
const zRotationDegreesPerSecond = 35;
const enableRotation = true;
const allowMouseRotation = true;
const allowKeyboardMotion = true;
const enableForcePolyfill = false;
// const SESSION_TYPE = "immersive-vr";
const SESSION_TYPE = "inline";
const MOUSE_SPEED = 0.003;
const MOVE_DISTANCE = 0.1;

const viewerStartPosition = vec3.fromValues(0, 0, -10);
const viewerStartOrientation = vec3.fromValues(0, 0, 1.0);

const cubeOrientation = vec3.create();
const cubeMatrix = mat4.create();
const mouseMatrix = mat4.create();
const inverseOrientation = quat.create();
const RADIANS_PER_DEGREE = Math.PI / 180.0;

const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec3 aVertexNormal;
  attribute vec2 aTextureCoord;

  uniform mat4 uNormalMatrix;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  varying highp vec2 vTextureCoord;
  varying highp vec3 vLighting;

  void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;

    // Apply lighting effect

    highp vec3 ambientLight = vec3(0.3, 0.3, 0.3);
    highp vec3 directionalLightColor = vec3(1, 1, 1);
    highp vec3 lightingVector = normalize(vec3(0.85, 0.8, 0.75));

    highp vec4 transformedNormal = uNormalMatrix * vec4(aVertexNormal, 1.0);

    highp float directional = max(dot(transformedNormal.xyz, lightingVector), 0.0);
    vLighting = ambientLight + (directionalLightColor * directional);
  }
`;

const fsSource = `
  varying highp vec2 vTextureCoord;
  varying highp vec3 vLighting;

  uniform sampler2D uSampler;

  void main(void) {
    highp vec4 texelColor = texture2D(uSampler, vTextureCoord);

    gl_FragColor = vec4(texelColor.rgb * vLighting, texelColor.a);
  }
`;


class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            xrSession: null,
            xrInputSources: null,
            xrReferenceSpace: null,
            xrButton: null,
            gl: null,
            animationFrameRequestID: 0,
            shaderProgram: null,
            programInfo: null,
            buffers: null,
            texture: null,
            mouseYaw: 0,
            mousePitch: 0,
            verticalDistance: 0,
            transverseDistance: 0,
            axialDistance: 0,

            xrOn: false,
            xrDisabled: false,
            canvasRef: React.createRef(),
            lastFrameTime: 0,
            normalMatrix: mat4.create(),
            modelViewMatrix: mat4.create(),

            projectionMatrixOut: <div></div>,
            modelMatrixOut: <div></div>,
            cameraMatrixOut: <div></div>,
            mouseMatrixOut: <div></div>,
        };

        this.onXRButtonClick = this.onXRButtonClick.bind(this);
        this.sessionStarted = this.sessionStarted.bind(this);
    }

    componentDidMount() {
        if (!navigator.xr || enableForcePolyfill) {
            console.log("Using the polyfill");
            polyfill = new WebXRPolyfill();
        }
        this.setupXRButton();
    }

    LogGLError = (where) => {
        const { gl } = this.state;

        let err = gl.getError();
        if (err) {
            console.error(`WebGL error returned by ${where}: ${err}`);
        }
    }

    initShaderProgram = (gl, vsSource, fsSource) => {
        const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

        // Create the shader program

        const shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        // If creating the shader program failed, alert

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
            return null;
        }

        return shaderProgram;
    }

    loadShader = (gl, type, source) => {
        const shader = gl.createShader(type);

        // Send the source to the shader object

        gl.shaderSource(shader, source);

        // Compile the shader program

        gl.compileShader(shader);

        // See if it compiled successfully

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    initBuffers = (gl) => {

        // Create a buffer for the square's positions.

        const positionBuffer = gl.createBuffer();

        // Select the positionBuffer as the one to apply buffer
        // operations to from here out.

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // Now create an array of positions for the square.

        const positions = [
            // Front face
            -1.0, -1.0, 1.0,
            1.0, -1.0, 1.0,
            1.0, 1.0, 1.0,
            -1.0, 1.0, 1.0,

            // Back face
            -1.0, -1.0, -1.0,
            -1.0, 1.0, -1.0,
            1.0, 1.0, -1.0,
            1.0, -1.0, -1.0,

            // Top face
            -1.0, 1.0, -1.0,
            -1.0, 1.0, 1.0,
            1.0, 1.0, 1.0,
            1.0, 1.0, -1.0,

            // Bottom face
            -1.0, -1.0, -1.0,
            1.0, -1.0, -1.0,
            1.0, -1.0, 1.0,
            -1.0, -1.0, 1.0,

            // Right face
            1.0, -1.0, -1.0,
            1.0, 1.0, -1.0,
            1.0, 1.0, 1.0,
            1.0, -1.0, 1.0,

            // Left face
            -1.0, -1.0, -1.0,
            -1.0, -1.0, 1.0,
            -1.0, 1.0, 1.0,
            -1.0, 1.0, -1.0,
        ];

        // Now pass the list of positions into WebGL to build the
        // shape. We do this by creating a Float32Array from the
        // JavaScript array, then use it to fill the current buffer.

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);

        const vertexNormals = [
            // Front
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0,

            // Back
            0.0, 0.0, -1.0,
            0.0, 0.0, -1.0,
            0.0, 0.0, -1.0,
            0.0, 0.0, -1.0,

            // Top
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,

            // Bottom
            0.0, -1.0, 0.0,
            0.0, -1.0, 0.0,
            0.0, -1.0, 0.0,
            0.0, -1.0, 0.0,

            // Right
            1.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            1.0, 0.0, 0.0,

            // Left
            -1.0, 0.0, 0.0,
            -1.0, 0.0, 0.0,
            -1.0, 0.0, 0.0,
            -1.0, 0.0, 0.0
        ];

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexNormals), gl.STATIC_DRAW);

        const textureCoordBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

        const textureCoordinates = [
            // Front
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
            // Back
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
            // Top
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
            // Bottom
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
            // Right
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
            // Left
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
        ];

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

        // This array defines each face as two triangles, using the
        // indices into the vertex array to specify each triangle's
        // position.

        const indices = [
            0, 1, 2, 0, 2, 3,    // front
            4, 5, 6, 4, 6, 7,    // back
            8, 9, 10, 8, 10, 11,   // top
            12, 13, 14, 12, 14, 15,   // bottom
            16, 17, 18, 16, 18, 19,   // right
            20, 21, 22, 20, 22, 23,   // left
        ];

        // Now send the element array to GL

        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        return {
            position: positionBuffer,
            normal: normalBuffer,
            textureCoord: textureCoordBuffer,
            indices: indexBuffer,
        };
    }

    loadTexture = (gl, url) => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Because images have to be downloaded over the internet
        // they might take a moment until they are ready.
        // Until then put a single pixel in the texture so we can
        // use it immediately. When the image has finished downloading
        // we'll update the texture with the contents of the image.
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = 1;
        const height = 1;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            width, height, border, srcFormat, srcType,
            pixel);

        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                srcFormat, srcType, image);

            // WebGL1 has different requirements for power of 2 images
            // vs non power of 2 images so check if the image is a
            // power of 2 in both dimensions.
            if (this.isPowerOf2(image.width) && this.isPowerOf2(image.height)) {
                // Yes, it's a power of 2. Generate mips.
                gl.generateMipmap(gl.TEXTURE_2D);
            } else {
                // No, it's not a power of 2. Turn off mips and set
                // wrapping to clamp to edge
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            }
        };
        image.src = url;

        return texture;
    }

    isPowerOf2(value) {
        return (value & (value - 1)) == 0;
    }

    setupXRButton = () => {
        if (navigator.xr.isSessionSupported) {
            navigator.xr.isSessionSupported(SESSION_TYPE)
                .then((supported) => {
                    this.setState({ xrDisabled: !supported });
                });
        } else {
            navigator.xr.supportsSession(SESSION_TYPE)
                .then(() => {
                    this.setState({ xrDisabled: false });
                })
                .catch(() => {
                    this.setState({ xrDisabled: true });
                });
        }
    }

    onXRButtonClick = async () => {
        const {
            xrOn,
            xrSession,
        } = this.state;

        this.setState({ xrOn: !xrOn });

        if (!xrSession) {
            navigator.xr.requestSession(SESSION_TYPE)
                .then(this.sessionStarted);
        } else {
            await xrSession.end();

            if (xrSession) {
                this.sessionEnded();
            }
        }
    }

    sessionStarted = (session) => {
        const { canvasRef, } = this.state;

        let refSpaceType;

        let _xrSession = session;

        _xrSession.addEventListener("end", this.sessionEnded);

        let _gl = canvasRef.current.getContext("webgl", { xrCompatible: true });

        if (allowMouseRotation) {
            canvasRef.current.addEventListener("pointermove", this.handlePointerMove);
            canvasRef.current.addEventListener("contextmenu", (event) => { event.preventDefault(); });
        }

        if (allowKeyboardMotion) {
            document.addEventListener("keydown", this.handleKeyDown);
        }

        let _shaderProgram = this.initShaderProgram(_gl, vsSource, fsSource);

        let _programInfo = {
            program: _shaderProgram,
            attribLocations: {
                vertexPosition: _gl.getAttribLocation(_shaderProgram, 'aVertexPosition'),
                vertexNormal: _gl.getAttribLocation(_shaderProgram, 'aVertexNormal'),
                textureCoord: _gl.getAttribLocation(_shaderProgram, 'aTextureCoord'),
            },
            uniformLocations: {
                projectionMatrix: _gl.getUniformLocation(_shaderProgram, 'uProjectionMatrix'),
                modelViewMatrix: _gl.getUniformLocation(_shaderProgram, 'uModelViewMatrix'),
                normalMatrix: _gl.getUniformLocation(_shaderProgram, 'uNormalMatrix'),
                uSampler: _gl.getUniformLocation(_shaderProgram, 'uSampler')
            },
        };

        let _buffers = this.initBuffers(_gl);
        let _texture = this.loadTexture(_gl, require('../assets/firefox_logo.png'));

        _xrSession.updateRenderState({
            baseLayer: new XRWebGLLayer(_xrSession, _gl)
        });

        if (SESSION_TYPE == "immersive-vr") {
            refSpaceType = "local";
        } else {
            refSpaceType = "viewer";
        }

        mat4.fromTranslation(cubeMatrix, viewerStartPosition);

        vec3.copy(cubeOrientation, viewerStartOrientation);

        _xrSession.requestReferenceSpace(refSpaceType)
            .then((refSpace) => {
                let _xrReferenceSpace = refSpace.getOffsetReferenceSpace(
                    new XRRigidTransform(viewerStartPosition, cubeOrientation));
                let _animationFrameRequestID = _xrSession.requestAnimationFrame(this.drawFrame);
                this.setState({
                    xrReferenceSpace: _xrReferenceSpace,
                    animationFrameRequestID: _animationFrameRequestID,
                });
            });

        this.setState({
            xrSession: _xrSession,
            gl: _gl,
            shaderProgram: _shaderProgram,
            programInfo: _programInfo,
            buffers: _buffers,
            texture: _texture,
        });

        return _xrSession;
    }

    sessionEnded = () => {
        const {
            animationFrameRequestID,
            xrSession
        } = this.state;

        if (animationFrameRequestID) {
            xrSession.cancelAnimationFrame(animationFrameRequestID);
            this.setState({ animationFrameRequestID: 0 });
        }
        this.setState({ xrSession: null });
    }

    handleKeyDown = (event) => {
        const {
            verticalDistance,
            transverseDistance,
            axialDistance,
            mouseYaw,
            mousePitch,
        } = this.state;

        let _verticalDistance = verticalDistance;
        let _transverseDistance = transverseDistance;
        let _axialDistance = axialDistance;
        let _mouseYaw = mouseYaw;
        let _mousePitch = mousePitch;

        switch (event.key) {
            case "w":
            case "W":
                _verticalDistance -= MOVE_DISTANCE;
                break;
            case "s":
            case "S":
                _verticalDistance += MOVE_DISTANCE;
                break;
            case "a":
            case "A":
                _transverseDistance += MOVE_DISTANCE;
                break;
            case "d":
            case "D":
                _transverseDistance -= MOVE_DISTANCE;
                break;
            case "ArrowUp":
                _axialDistance += MOVE_DISTANCE;
                break;
            case "ArrowDown":
                _axialDistance -= MOVE_DISTANCE;
                break;
            case "r":
            case "R":
                _transverseDistance = _axialDistance = _verticalDistance = 0;
                _mouseYaw = _mousePitch = 0;
                break;
            default:
                break;
        }

        this.setState({
            verticalDistance: _verticalDistance,
            transverseDistance: _transverseDistance,
            axialDistance: _axialDistance,
            mouseYaw: _mouseYaw,
            mousePitch: _mousePitch,
        });
    }

    handlePointerMove = (event) => {
        if (event.buttons & 2) {
            this.rotateViewBy(event.movementX, event.movementY);
        }
    }

    rotateViewBy = (dx, dy) => {
        const {
            mouseYaw,
            mousePitch,
        } = this.state;

        let _mouseYaw = mouseYaw - dx * MOUSE_SPEED;
        let _mousePitch = mousePitch - dy * MOUSE_SPEED;

        if (_mousePitch < -Math.PI * 0.5) {
            _mousePitch = -Math.PI * 0.5;
        } else if (_mousePitch > Math.PI * 0.5) {
            _mousePitch = Math.PI * 0.5;
        }

        this.setState({
            mouseYaw: _mouseYaw,
            mousePitch: _mousePitch,
        });
    }

    drawFrame = (time, frame) => {
        const {
            xrReferenceSpace,
            gl,
            lastFrameTime,
            programInfo,
            buffers,
            texture,
        } = this.state;

        let session = frame.session;
        let adjustedRefSpace = xrReferenceSpace;
        let pose = null;

        this.setState({ animationFrameRequestID: session.requestAnimationFrame(this.drawFrame) });
        adjustedRefSpace = this.applyViewerControls(xrReferenceSpace);
        pose = frame.getViewerPose(adjustedRefSpace);

        if (pose) {
            let glLayer = session.renderState.baseLayer;

            gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
            this.LogGLError("bindFrameBuffer");

            gl.clearColor(0, 0, 0, 1.0);
            gl.clearDepth(1.0);                 // Clear everything
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.LogGLError("glClear");

            const deltaTime = (time - lastFrameTime) * 0.001;  // Convert to seconds
            this.setState({ lastFrameTime: time });

            for (let view of pose.views) {
                let viewport = glLayer.getViewport(view);
                gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
                this.LogGLError(`Setting viewport for eye: ${view.eye}`);
                gl.canvas.width = viewport.width * pose.views.length;
                gl.canvas.height = viewport.height;
                this.renderScene(gl, view, programInfo, buffers, texture, deltaTime);
            }
        }
    }

    applyViewerControls = (refSpace) => {
        const {
            mouseYaw,
            mousePitch,
            axialDistance,
            transverseDistance,
            verticalDistance,
        } = this.state;

        if (!mouseYaw && !mousePitch && !axialDistance &&
            !transverseDistance && !verticalDistance) {
            return refSpace;
        }

        quat.identity(inverseOrientation);
        quat.rotateX(inverseOrientation, inverseOrientation, -mousePitch);
        quat.rotateY(inverseOrientation, inverseOrientation, -mouseYaw);

        let newTransform = new XRRigidTransform({
            x: transverseDistance,
            y: verticalDistance,
            z: axialDistance
        },
            {
                x: inverseOrientation[0], y: inverseOrientation[1],
                z: inverseOrientation[2], w: inverseOrientation[3]
            });
        mat4.copy(mouseMatrix, newTransform.matrix);

        return refSpace.getOffsetReferenceSpace(newTransform);
    }

    renderScene = (gl, view, programInfo, buffers, texture, deltaTime) => {
        const {
            normalMatrix,
            modelViewMatrix,
            projectionMatrixOut,
            modelMatrixOut,
            cameraMatrixOut,
            mouseMatrixOut,
        } = this.state;

        let _normalMatrix = normalMatrix;
        let _modelViewMatrix = modelViewMatrix;

        const xRotationForTime = (xRotationDegreesPerSecond * RADIANS_PER_DEGREE) * deltaTime;
        const yRotationForTime = (yRotationDegreesPerSecond * RADIANS_PER_DEGREE) * deltaTime;
        const zRotationForTime = (zRotationDegreesPerSecond * RADIANS_PER_DEGREE) * deltaTime;

        gl.enable(gl.DEPTH_TEST);           // Enable depth testing
        gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

        if (enableRotation) {
            mat4.rotate(cubeMatrix,  // destination matrix
                cubeMatrix,  // matrix to rotate
                zRotationForTime,     // amount to rotate in radians
                [0, 0, 1]);       // axis to rotate around (Z)
            mat4.rotate(cubeMatrix,  // destination matrix
                cubeMatrix,  // matrix to rotate
                yRotationForTime, // amount to rotate in radians
                [0, 1, 0]);       // axis to rotate around (Y)
            mat4.rotate(cubeMatrix,  // destination matrix
                cubeMatrix,  // matrix to rotate
                xRotationForTime, // amount to rotate in radians
                [1, 0, 0]);       // axis to rotate around (X)
        }

        mat4.multiply(_modelViewMatrix, view.transform.inverse.matrix, cubeMatrix);
        mat4.invert(_normalMatrix, _modelViewMatrix);
        mat4.transpose(_normalMatrix, _normalMatrix);

        let _projectionMatrixOut = mat4.clone(projectionMatrixOut);
        let _modelMatrixOut = mat4.clone(modelMatrixOut);
        let _cameraMatrixOut = mat4.clone(cameraMatrixOut);
        let _mouseMatrixOut = mat4.clone(mouseMatrixOut);

        this.displayMatrix(view.projectionMatrix, 4, _projectionMatrixOut);
        this.displayMatrix(_modelViewMatrix, 4, _modelMatrixOut);
        this.displayMatrix(view.transform.matrix, 4, _cameraMatrixOut);
        this.displayMatrix(mouseMatrix, 4, _mouseMatrixOut);

        {
            const numComponents = 3;
            const type = gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
            gl.vertexAttribPointer(
                programInfo.attribLocations.vertexPosition,
                numComponents,
                type,
                normalize,
                stride,
                offset);
            gl.enableVertexAttribArray(
                programInfo.attribLocations.vertexPosition);
        }

        {
            const numComponents = 2;
            const type = gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
            gl.vertexAttribPointer(
                programInfo.attribLocations.textureCoord,
                numComponents,
                type,
                normalize,
                stride,
                offset);
            gl.enableVertexAttribArray(
                programInfo.attribLocations.textureCoord);
        }

        {
            const numComponents = 3;
            const type = gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
            gl.vertexAttribPointer(
                programInfo.attribLocations.vertexNormal,
                numComponents,
                type,
                normalize,
                stride,
                offset);
            gl.enableVertexAttribArray(
                programInfo.attribLocations.vertexNormal);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
        gl.useProgram(programInfo.program);

        gl.uniformMatrix4fv(
            programInfo.uniformLocations.projectionMatrix,
            false,
            view.projectionMatrix);
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.modelViewMatrix,
            false,
            _modelViewMatrix);
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.normalMatrix,
            false,
            _normalMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

        {
            const vertexCount = 36;
            const type = gl.UNSIGNED_SHORT;
            const offset = 0;
            gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
        }
    }

    displayMatrix = (mat, rowLength, target) => {
        let outHTML = "";

        if (mat && rowLength && rowLength <= mat.length) {
            let numRows = mat.length / rowLength;
            outHTML = "<math xmlns='http://www.w3.org/1998/Math/MathML' display='block'>\n<mrow>\n<mo>[</mo>\n<mtable>\n";

            for (let y = 0; y < numRows; y++) {
                outHTML += "<mtr>\n";
                for (let x = 0; x < rowLength; x++) {
                    outHTML += `<mtd><mn>${mat[(x * rowLength) + y].toFixed(2)}</mn></mtd>\n`;
                }
                outHTML += "</mtr>\n";
            }

            outHTML += "</mtable>\n<mo>]</mo>\n</mrow>\n</math>";
        }

        target.innerHTML = outHTML;
    }

    render() {
        const {
            xrDisabled,
            xrOn,
            canvasRef
        } = this.state;

        return (
            <div>
                <button
                    className="xrBtn"
                    onClick={async () => { await this.onXRButtonClick(); }}
                    disabled={xrDisabled}
                >
                    {
                        xrDisabled ?
                            'XR NOT SUPPORTED' :
                            `XR: ${xrOn ? 'ON' : 'OFF'}`
                    }
                </button>
                <div id="projection-matrix"></div>
                <div id="model-view-matrix"></div>
                <div id="camera-matrix"></div>
                <div id="mouse-matrix"></div>
                <canvas ref={canvasRef} width={window.innerWidth * 0.9} height={window.innerHeight * 0.9}></canvas>
            </div>
        );
    }
};

export default App;