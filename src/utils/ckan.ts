import {fetchParseError} from "./net";

export type PackageDict = {
    license_title?: string,
    maintainer?: string,
    relationships_as_object: any[],
    private: boolean,
    maintainer_email?: string,
    num_tags: number,
    id: string,
    metadata_created: string,
    metadata_modified: string,
    author?: string,
    author_email?: string,
    state: "active" | "deleted",
    version?: string,
    creator_user_id?: string,
    type: 'user' | 'dataset' | 'group',
    resources: ResourceDict[],
    num_resources: number,
    tags: any[], //TODO
    groups: any[ ], //TODO
    license_id?: string,
    relationships_as_subject: any[ ], //TODO
    organization?: any, //TODO
    name: string,
    isopen: boolean,
    url?: string,
    notes?: string,
    owner_org?: any, //TODO
    extras: any[ ], //TODO
    title?: string,
    revision_id: string
}

export type ResourceDict = {
    mimetype?: string,
    cache_url?: string,
    state: "active" | "deleted",
    hash?: string,
    description?: string,
    format: string,
    url: string,
    datastore_active: boolean,
    created: string,
    cache_last_updated?: string,
    package_id: string,
    mimetype_inner?: string,
    last_modified?: string,
    position?: number,
    revision_id: string,
    size?: number,
    url_type?: string,
    id: string,
    resource_type?: string,
    name: string
}

export type CkanApiResponse = {
    'help': string,
    'success': boolean,
    'result'?: any,
    'error'?: {message: string},
}

export type SearchFacetSummary = {
    'title': string | undefined,
    'items': {
        'count': number,
        'display_name': string,
        'name': string}[]
}

export type PackageSearchResponse = {
    'count': number,
    'sort'?: string,
    'results': PackageDict[],
    'search_facets': {
        [facetKey: string]: SearchFacetSummary
    }
}

export type PackageSearchRequest = {
    q?: string;
    fq?: string;
    sort?: string;
    rows?: number;
    start?: number;
    facet?: string;
    'facet.mincount'?: number;
    'facet.limit'?: number;
    'facet.field'?: string[];
    include_drafts?: boolean;
    include_private?: boolean;
    use_default_schema?: boolean;
}

export type ResourceSearchResponse = {
    'count': number,
    'results': ResourceDict[]
}

export type ResourceSearchRequest = {
    query: string;
    order_by?: string;
    offset?: number;
    limit?: number
}

export class CkanClient {
    private ckan_url: string;
    private proxify_fn?: (url: URL) => URL;

    constructor(url: string, proxy_fn?: (url: URL) => URL) {
        if (!url.endsWith('/')) url += '/'
        this.ckan_url = url;

        this.proxify_fn = proxy_fn;
    }

    async package_search(request: PackageSearchRequest): Promise<PackageSearchResponse> {
        return await this.sendRequest('package_search', request) as PackageSearchResponse;
    }

    async resource_search(request: ResourceSearchRequest): Promise<ResourceSearchResponse> {
        return await this.sendRequest('resource_search', request) as ResourceSearchResponse;
    }

    sendRequest(action: string, data?: any, requestType: 'GET' | 'POST' = 'GET'): Promise<any> {

        let actionUrl = this.ckan_url + 'api/action/' + action;

        const options: RequestInit = {
            method: requestType
        };

        if (requestType == 'GET') {
            const query = data && Object.keys(data)
                .filter(key => data[key] != undefined)
                .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key])).join('&');
            if (query) actionUrl += '?' + query;
        } else {
            options.body = data;
        }

        actionUrl = this.proxify_fn ? this.proxify_fn(new URL(actionUrl)).href : actionUrl;

        return fetchParseError(actionUrl, options).then(
            resp => {
            return resp.json().then( (jsonResp: CkanApiResponse) => {
                if (jsonResp.success) {
                    return jsonResp.result;
                } else {
                    throw `CKAN request failed : ${jsonResp.result.message}`;
                }
            } );
        },reason => {throw 'CKAN request failed : '+reason});
    }


}