
// return an instance of ProjectDescriptor that describes the cellular automata :
// wms inputs, init function, step function, render function.

/** @type lib.spatial.ProjectDescriptor */
const projectDescriptor = {


    description: `This is a blank project. Add your code in the Code panel.`,

    /**
     * a set of geospatial layers (currently only WMS) that will be used to init the cellular automata
     * each layer can be of the form <wms_url>#<layer_name>, or a {@link spatial.LayerDescriptor} instance describing the resource
     * @type (spatial.LayerDescriptor | string)[]
     */
    data_layers: ['http://server.com/wms#0'],

    // Default extent in EPSG:4326 ; optional
    extent: [-180, -90, 180, 90],

    // the CA step function that generates a new state form the previous state
    stepFn: (previousState, base) => undefined /* TODO generate new state */ ,

    // Initialize the CA lattices
    init: (images, size) => [
        // the initial state lattice
        initialLattice,
        // a static lattice containing static terrain information (optional)
        staticLattice
    ],

    // function that renders the CA state into a canvas image
    renderFn: (state, base) => undefined /* TODO do the rendering */
};

return projectDescriptor;