
// Let's import an existing model
const automata = new lib.waterflow.WaterflowAutomata2();

// Transform water level into alpha transparency for the rendering
// The more water, the less transparent
const level2alpha = (level) => 1 - 1 / Math.pow(1 + level/5 , 2);

return {
    // Take a WMS that provides elevation as a blue to red gradient
    layers: ['https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer#0'],

    // Default extent
    extent: [4.4,49.4,5.5,51],

    // use the CA step function from the imported model
    stepFn: (state, base) => automata.step(state, base),

    // Initialize the model
    init: (images, size) => [
        // create the state lattice
        new lib.model.BaseLattice2D(
            size[0], size[1],
            // for each cell, init the TerrainCellStatus instance
            (x, y) => ([
                0,
                Math.random()>.5 ? 0.4 : 0, // pour random water over the terrain
                [0,0]
            ])
        ),
        // create the static terrain lattice from elevation WMS
        lib.spatial.TerrainLattice.createFromImages(images[0])
    ],

    // render the CA model state into a canvas image
    renderFn: (state, base) =>
        // use the fromLattice function that converts lattice to canvas
        // on a per-cell basis
        lib.model.ImageDataLattice.fromLattice(
            state,
            // set each to blue with transparency computed with level2alpha
            (x, y, cell) => [0,0,255, level2alpha(cell[1])*255]
        ).getData()
}