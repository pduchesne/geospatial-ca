
// return an instance of ProjectDescriptor

return {
    // a set of W*S layers that will be used to init the cellular automata
    layers: ['http://server.com/wms#0'],

    // Default extent in EPSG:4326 ; optional
    extent: [-180, -90, 180, 90],

    // the CA step function that generates a new state form the previous state
    stepFn: (previousState, base) => /* generate new state */ ,

    // Initialize the CA lattices
    init: (images, size) => [
        // the initial state lattice
        initialLattice,
        // a static lattice containing static terrain information (optional)
        staticLattice
    ],

    // function that renders the CA state into a canvas image
    renderFn: (state, base) => /* do the rendering */
}