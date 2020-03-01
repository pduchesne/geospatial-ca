
// Let's import an existing model of waterflow
const automata = new lib.waterflow.WaterflowAutomata2();

// Transform water level into alpha transparency for the rendering
// The more water, the less transparent
const level2alpha = (level) => 1 - 1 / Math.pow(1 + level/5 , 2);

/** @type lib.spatial.ProjectDescriptor */
const projectDescriptor = {
    description: `Example of a CA that models waterflow based on DEM data. 
                  This example uses Wallonia DEM data served by a WMS.
                  
                  Try initializing CA at various zoom levels `,

    data_layers: [
        // This WMS provides DEM data as a blue to red gradient
        'https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer#0',
        'https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WMSServer#2',
        'https://image.discomap.eea.europa.eu/arcgis/services/GioLandPublic/ESM2012_Release2017_UAColours_WM/MapServer/WMSServer#1'
    ],

    // Default extent
    extent: [4.4,49.4,5.5,51],

    // delegate the CA step function to the imported model instance
    stepFn: (state, base) => automata.step(state, base),

    // Initialize the model
    init: (images, size) => [
        // create the state lattice
        new lib.model.BaseLattice2D(
            size[0], size[1],
            // each state cell is a 2-dim array [water_inner, water_outer]
            // (this is inherited from the imported model - only water_outer is used)
            (x, y) => ([
                0,
                Math.random() * 2, // pour random water over the terrain
            ])
        ),
        // create the static terrain lattice from elevation WMS
        // this method reads the hue value of each pixel, converts it into meters
        // and inits a BaseLattice2D with each cell being a 1-dim array with the elevation value
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
        ).getData(),

    // (optional) render HTML for the selected cell. Resulting HTML is appended in the control panel.
    renderHtml: lib.waterflow.renderHtml
};

return projectDescriptor;