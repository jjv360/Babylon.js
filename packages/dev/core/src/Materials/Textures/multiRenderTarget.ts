import type { Scene } from "../../scene";
import type { Engine } from "../../Engines/engine";
import { Texture } from "../../Materials/Textures/texture";
import { RenderTargetTexture } from "../../Materials/Textures/renderTargetTexture";
import { Constants } from "../../Engines/constants";

import "../../Engines/Extensions/engine.multiRender";
import type { InternalTexture } from "./internalTexture";

/**
 * Creation options of the multi render target texture.
 */
export interface IMultiRenderTargetOptions {
    /**
     * Define if the texture needs to create mip maps after render.
     */
    generateMipMaps?: boolean;
    /**
     * Define the types of all the draw buffers we want to create
     */
    types?: number[];
    /**
     * Define the sampling modes of all the draw buffers we want to create
     */
    samplingModes?: number[];
    /**
     * Define if sRGB format should be used for each of the draw buffers we want to create
     */
    useSRGBBuffers?: boolean[];
    /**
     * Define if a depth buffer is required
     */
    generateDepthBuffer?: boolean;
    /**
     * Define if a stencil buffer is required
     */
    generateStencilBuffer?: boolean;
    /**
     * Define if a depth texture is required instead of a depth buffer
     */
    generateDepthTexture?: boolean;
    /**
     * Define depth texture format to use
     */
    depthTextureFormat?: number;
    /**
     * Define the number of desired draw buffers
     */
    textureCount?: number;
    /**
     * Define if aspect ratio should be adapted to the texture or stay the scene one
     */
    doNotChangeAspectRatio?: boolean;
    /**
     * Define the default type of the buffers we are creating
     */
    defaultType?: number;
    /**
     * Define the default type of the buffers we are creating
     */
    drawOnlyOnFirstAttachmentByDefault?: boolean;
}

/**
 * A multi render target, like a render target provides the ability to render to a texture.
 * Unlike the render target, it can render to several draw buffers in one draw.
 * This is specially interesting in deferred rendering or for any effects requiring more than
 * just one color from a single pass.
 */
export class MultiRenderTarget extends RenderTargetTexture {
    private _textures: Texture[];
    private _multiRenderTargetOptions: IMultiRenderTargetOptions;
    private _count: number;
    private _drawOnlyOnFirstAttachmentByDefault: boolean;

    /**
     * Get if draw buffers are currently supported by the used hardware and browser.
     */
    public get isSupported(): boolean {
        return this._engine?.getCaps().drawBuffersExtension ?? false;
    }

    /**
     * Get the list of textures generated by the multi render target.
     */
    public get textures(): Texture[] {
        return this._textures;
    }

    /**
     * Gets the number of textures in this MRT. This number can be different from `_textures.length` in case a depth texture is generated.
     */
    public get count(): number {
        return this._count;
    }

    /**
     * Get the depth texture generated by the multi render target if options.generateDepthTexture has been set
     */
    public get depthTexture(): Texture {
        return this._textures[this._textures.length - 1];
    }

    /**
     * Set the wrapping mode on U of all the textures we are rendering to.
     * Can be any of the Texture. (CLAMP_ADDRESSMODE, MIRROR_ADDRESSMODE or WRAP_ADDRESSMODE)
     */
    public set wrapU(wrap: number) {
        if (this._textures) {
            for (let i = 0; i < this._textures.length; i++) {
                this._textures[i].wrapU = wrap;
            }
        }
    }

    /**
     * Set the wrapping mode on V of all the textures we are rendering to.
     * Can be any of the Texture. (CLAMP_ADDRESSMODE, MIRROR_ADDRESSMODE or WRAP_ADDRESSMODE)
     */
    public set wrapV(wrap: number) {
        if (this._textures) {
            for (let i = 0; i < this._textures.length; i++) {
                this._textures[i].wrapV = wrap;
            }
        }
    }

    /**
     * Instantiate a new multi render target texture.
     * A multi render target, like a render target provides the ability to render to a texture.
     * Unlike the render target, it can render to several draw buffers in one draw.
     * This is specially interesting in deferred rendering or for any effects requiring more than
     * just one color from a single pass.
     * @param name Define the name of the texture
     * @param size Define the size of the buffers to render to
     * @param count Define the number of target we are rendering into
     * @param scene Define the scene the texture belongs to
     * @param options Define the options used to create the multi render target
     * @param textureNames Define the names to set to the textures (if count > 0 - optional)
     */
    constructor(name: string, size: any, count: number, scene?: Scene, options?: IMultiRenderTargetOptions, textureNames?: string[]) {
        const generateMipMaps = options && options.generateMipMaps ? options.generateMipMaps : false;
        const generateDepthTexture = options && options.generateDepthTexture ? options.generateDepthTexture : false;
        const depthTextureFormat = options && options.depthTextureFormat ? options.depthTextureFormat : Constants.TEXTUREFORMAT_DEPTH16;
        const doNotChangeAspectRatio = !options || options.doNotChangeAspectRatio === undefined ? true : options.doNotChangeAspectRatio;
        const drawOnlyOnFirstAttachmentByDefault = options && options.drawOnlyOnFirstAttachmentByDefault ? options.drawOnlyOnFirstAttachmentByDefault : false;
        super(name, size, scene, generateMipMaps, doNotChangeAspectRatio, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

        if (!this.isSupported) {
            this.dispose();
            return;
        }

        const types: number[] = [];
        const samplingModes: number[] = [];
        const useSRGBBuffers: boolean[] = [];
        this._initTypes(count, types, samplingModes, useSRGBBuffers, options);

        const generateDepthBuffer = !options || options.generateDepthBuffer === undefined ? true : options.generateDepthBuffer;
        const generateStencilBuffer = !options || options.generateStencilBuffer === undefined ? false : options.generateStencilBuffer;

        this._size = size;
        this._multiRenderTargetOptions = {
            samplingModes: samplingModes,
            generateMipMaps: generateMipMaps,
            generateDepthBuffer: generateDepthBuffer,
            generateStencilBuffer: generateStencilBuffer,
            generateDepthTexture: generateDepthTexture,
            depthTextureFormat: depthTextureFormat,
            types: types,
            textureCount: count,
            useSRGBBuffers: useSRGBBuffers,
        };

        this._count = count;
        this._drawOnlyOnFirstAttachmentByDefault = drawOnlyOnFirstAttachmentByDefault;

        if (count > 0) {
            this._createInternalTextures();
            this._createTextures(textureNames);
        }
    }

    private _initTypes(count: number, types: number[], samplingModes: number[], useSRGBBuffers: boolean[], options?: IMultiRenderTargetOptions) {
        for (let i = 0; i < count; i++) {
            if (options && options.types && options.types[i] !== undefined) {
                types.push(options.types[i]);
            } else {
                types.push(options && options.defaultType ? options.defaultType : Constants.TEXTURETYPE_UNSIGNED_INT);
            }

            if (options && options.samplingModes && options.samplingModes[i] !== undefined) {
                samplingModes.push(options.samplingModes[i]);
            } else {
                samplingModes.push(Texture.BILINEAR_SAMPLINGMODE);
            }

            if (options && options.useSRGBBuffers && options.useSRGBBuffers[i] !== undefined) {
                useSRGBBuffers.push(options.useSRGBBuffers[i]);
            } else {
                useSRGBBuffers.push(false);
            }
        }
    }

    /**
     * @param forceFullRebuild
     * @param textureNames
     * @hidden
     */
    public _rebuild(forceFullRebuild: boolean = false, textureNames?: string[]): void {
        if (this._count < 1) {
            return;
        }

        this.releaseInternalTextures();
        this._createInternalTextures();

        if (forceFullRebuild) {
            this._releaseTextures();
            this._createTextures(textureNames);
        }

        const internalTextures = this._renderTarget!.textures!;
        for (let i = 0; i < internalTextures.length; i++) {
            const texture = this._textures[i];
            texture._texture = internalTextures[i];
        }

        if (this.samples !== 1) {
            this._renderTarget!.setSamples(this.samples, !this._drawOnlyOnFirstAttachmentByDefault, true);
        }
    }

    private _createInternalTextures(): void {
        this._renderTarget = this._getEngine()!.createMultipleRenderTarget(this._size, this._multiRenderTargetOptions, !this._drawOnlyOnFirstAttachmentByDefault);
        this._texture = this._renderTarget.texture;
    }

    private _releaseTextures(): void {
        if (this._textures) {
            for (let i = 0; i < this._textures.length; i++) {
                this._textures[i]._texture = null; // internal textures are released by a call to releaseInternalTextures()
                this._textures[i].dispose();
            }
        }
    }

    private _createTextures(textureNames?: string[]): void {
        const internalTextures = this._renderTarget!.textures!;
        this._textures = [];
        for (let i = 0; i < internalTextures.length; i++) {
            const texture = new Texture(null, this.getScene());
            if (textureNames?.[i]) {
                texture.name = textureNames[i];
            }
            texture._texture = internalTextures[i];
            this._textures.push(texture);
        }
    }

    /**
     * Replaces an internal texture within the MRT. Useful to share textures between MultiRenderTarget.
     * @param texture The new texture to set in the MRT
     * @param index The index of the texture to replace
     * @param disposePrevious Set to true if the previous internal texture should be disposed
     */
    public setInternalTexture(texture: InternalTexture, index: number, disposePrevious: boolean = true) {
        if (!this.renderTarget) {
            return;
        }

        if (index === 0) {
            this._texture = texture;
        }

        this.renderTarget.setTexture(texture, index, disposePrevious);

        if (!this.textures[index]) {
            this.textures[index] = new Texture(null, this.getScene());
        }
        this.textures[index]._texture = texture;

        this._count = this.renderTarget.textures ? this.renderTarget.textures.length : 0;

        if (this._multiRenderTargetOptions.types) {
            this._multiRenderTargetOptions.types[index] = texture.type;
        }
        if (this._multiRenderTargetOptions.samplingModes) {
            this._multiRenderTargetOptions.samplingModes[index] = texture.samplingMode;
        }
        if (this._multiRenderTargetOptions.useSRGBBuffers) {
            this._multiRenderTargetOptions.useSRGBBuffers[index] = texture._useSRGBBuffer;
        }
    }

    /**
     * Define the number of samples used if MSAA is enabled.
     */
    public get samples(): number {
        return this._samples;
    }

    public set samples(value: number) {
        if (this._renderTarget) {
            this._samples = this._renderTarget.setSamples(value);
        } else {
            // In case samples are set with 0 textures created, we must save the desired samples value
            this._samples = value;
        }
    }

    /**
     * Resize all the textures in the multi render target.
     * Be careful as it will recreate all the data in the new texture.
     * @param size Define the new size
     */
    public resize(size: any) {
        this._size = size;
        this._rebuild();
    }

    /**
     * Changes the number of render targets in this MRT
     * Be careful as it will recreate all the data in the new texture.
     * @param count new texture count
     * @param options Specifies texture types and sampling modes for new textures
     * @param textureNames Specifies the names of the textures (optional)
     */
    public updateCount(count: number, options?: IMultiRenderTargetOptions, textureNames?: string[]) {
        this._multiRenderTargetOptions.textureCount = count;
        this._count = count;

        const types: number[] = [];
        const samplingModes: number[] = [];
        const useSRGBBuffers: boolean[] = [];

        this._initTypes(count, types, samplingModes, useSRGBBuffers, options);
        this._multiRenderTargetOptions.types = types;
        this._multiRenderTargetOptions.samplingModes = samplingModes;
        this._multiRenderTargetOptions.useSRGBBuffers = useSRGBBuffers;
        this._rebuild(true, textureNames);
    }

    protected _unbindFrameBuffer(engine: Engine, faceIndex: number): void {
        if (this._renderTarget) {
            engine.unBindMultiColorAttachmentFramebuffer(this._renderTarget, this.isCube, () => {
                this.onAfterRenderObservable.notifyObservers(faceIndex);
            });
        }
    }

    /**
     * Dispose the render targets and their associated resources
     * @param doNotDisposeInternalTextures
     */
    public dispose(doNotDisposeInternalTextures = false): void {
        this._releaseTextures();
        if (!doNotDisposeInternalTextures) {
            this.releaseInternalTextures();
        } else {
            // Prevent internal texture dispose in super.dispose
            this._texture = null;
        }
        super.dispose();
    }

    /**
     * Release all the underlying texture used as draw buffers.
     */
    public releaseInternalTextures(): void {
        const internalTextures = this._renderTarget?.textures;

        if (!internalTextures) {
            return;
        }

        for (let i = internalTextures.length - 1; i >= 0; i--) {
            this._textures[i]._texture = null;
        }

        this._renderTarget?.dispose();
        this._renderTarget = null;
    }
}
