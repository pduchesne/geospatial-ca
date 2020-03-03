import ImageLayer from "ol/layer/Image";
import ImageWMS from "ol/source/ImageWMS";
import * as layer from "ol/layer";
import {Options as TileOptions} from "ol/layer/Tile";
import {Options as ImageOptions} from "ol/layer/Image";
import TileWMS from "ol/source/TileWMS";
import LayerRenderer from "ol/renderer/Layer";
import BaseLayer from "ol/layer/Base";

export type WMSCapabilities_Layer = {
    "Name"?: string,
    "Title"?: string,
    "Abstract"?: string,
    "CRS": string[],
    "EX_GeographicBoundingBox": [number, number, number, number],
    "BoundingBox": {
        "crs": string,
        "extent": [number, number, number, number],
        "res": [number | null, number | null]
    }[],
    "Style": {
        "Name": string,
        "Title"?: string,
        "LegendURL": {
            "Format": string,
            "OnlineResource": string,
            "size": [number, number]
        }[]
    }[],
    "queryable": boolean,
    "opaque": boolean,
    "noSubsets": boolean
    "Layer"?: WMSCapabilities_Layer[],
    MaxScaleDenominator?: number,
    MinScaleDenominator?: number,
    AuthorityURL?: {OnlineResource?: string, name?: string}[]
}

export type ParsedWMSCapabilities = {
    "version": string,
    "Service": {
        "Name": string,
        "Title"?: string,
        "Abstract"?: string,
        "KeywordList": string[],
        "OnlineResource": string,
        "ContactInformation"?: {
            "ContactPersonPrimary"?: {"ContactPerson": string, "ContactOrganization": string},
            "ContactPosition"?: string,
            "ContactAddress"?: {
                "AddressType"?: string,
                "Address"?: string,
                "City"?: string,
                "StateOrProvince"?: string,
                "PostCode"?: string,
                "Country"?: string
            },
            "ContactVoiceTelephone"?: string,
            "ContactFacsimileTelephone"?: string,
            "ContactElectronicMailAddress"?: string
        },
        "Fees"?: string,
        "AccessConstraints"?: string,
        "MaxWidth"?: number,
        "MaxHeight"?: number
    },
    "Capability": {
        "Request": {
            [requestName: string]: {
                "Format": string[],
                "DCPType": {
                    "HTTP": { [HttpMethod: string]: { "OnlineResource": string}}}[]
            }
        },
        "Exception": string[],
        "Layer": WMSCapabilities_Layer
    }
}

export type LayerDescriptor = {
    type?: string, //'WMS' | 'WFS' | 'WCS' | 'WMTS' | 'KML' | 'GeoJson',
    extent?: [number, number, number, number],
    maxScale?: number,
    url: string,
    name?: string,
    title?: string,
    tiled?: boolean,
    attribution?: string
}

export function stripOGCParams(url_str: string) {

    const paramsToRemove = ['request','service','version','layers'];
    const url = new URL(url_str);
    url.searchParams.forEach( (value, key, parent) => {
        if (paramsToRemove.indexOf(key.toLowerCase()) >= 0)
            parent.delete(key);
    }  );

    return url;
}

export function descriptorFromString(url: string): LayerDescriptor {
    const [service_url, layerName] = url.split('#');

    return {
        type: guessTypeFromUrl(service_url),
        url: stripOGCParams(service_url).href,
        name: layerName,
        tiled: true
    }
}

export function descriptorFromWMSCapabilities(url: string, layerCapas: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities): LayerDescriptor {

    return {
        type: 'WMS',
        url: stripOGCParams(url).href,
        name: layerCapas.Name,
        title: layerCapas.Title,
        extent: layerCapas.EX_GeographicBoundingBox,
        maxScale: layerCapas.MaxScaleDenominator,
        attribution: layerCapas.AuthorityURL?.length ?
            layerCapas.AuthorityURL[0].name :
            capas?.Service.ContactInformation?.ContactPersonPrimary?.ContactOrganization,
        tiled: true
    }
}

export function guessTypeFromUrl(url: string): string {
    //TODO
    return "WMS";
}

export function createLayerFromDescriptor(ld: LayerDescriptor) {

    const layerType = ld.type || guessTypeFromUrl(ld.url);

    switch (layerType) {
        case "WMS":
            if (ld.tiled) {
                return new layer.Tile({
                    source: new TileWMS({
                        crossOrigin: 'Anonymous',

                        url: stripOGCParams(ld.url).href,
                        params: {'LAYERS': ld.name, 'TILED': true},
                        attributions: ld.attribution
                    }),
                    title: ld.title || ld.name,
                    descriptor: ld
                } as TileOptions )
            } else {
                return new ImageLayer({
                    source: new ImageWMS({
                        crossOrigin: 'Anonymous',
                        url: stripOGCParams(ld.url).href,
                        params: {'LAYERS': ld.name},
                        attributions: ld.attribution
                    }),
                    title: ld.title || ld.name,
                    descriptor: ld
                } as ImageOptions)
            }
        default:
            throw "Unsupported resource type : " + layerType;
    }

}

export function getLayerCanvasContext(layer: BaseLayer): CanvasRenderingContext2D | undefined {
    const anyLayer = (layer as any);
    const renderer = anyLayer.getRenderer && anyLayer.getRenderer() as LayerRenderer;
    if (renderer)
        return (renderer as any).context as CanvasRenderingContext2D;
    else
        return undefined;
}

/*
export function renderMapToCanvas(map: Map, width?: number, height?: number): HTMLCanvasElement {
    const canvas: HTMLCanvasElement = document.createElement('canvas');

    width = width || map.getSize()![0];
    height = height || map.getSize()![1];

    canvas.setAttribute('width', width+'px');
    canvas.setAttribute('height', height+'px');

    map.getLayers().forEach(l => {
        if (l.getVisible()) {
            const ctx = getLayerCanvasContext(l);
            ctx && canvas.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
        }
    });

    return canvas;
}
 */

