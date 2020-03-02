// Transform water level into alpha transparency for the rendering
// The more water, the less transparent
const level2alpha = (level) => 1 - 1 / Math.pow(1 + level / 5, 2);

// precompute for performance sake
const SIN135 = Math.sin(Math.PI * 135/180);

/** @type lib.spatial.ProjectDescriptor<[number], [number, number, number, number]> */
const projectDescriptor = {

    description: `Wind flow model, based on belgian Alaro weather model (https://data.gov.be/en/dataset/alaro).`,

    data_layers: [
        // Alaro WMS, wind vector u component
        // there's an optional TIME URL parameter, e.g. &TIME=2020-02-27T01:00:00.000Z
        {
            url: 'https://demo.highlatitud.es/proxy?_uri=https://opendata.meteo.be/service/alaro/ows',
            name: '10_m_u__wind_component',
            tiled: false,
            attribution: 'Royal Meteorological Institute of Belgium'
        },
        // Alaro WMS, wind vector v component
        {
            url: 'https://demo.highlatitud.es/proxy?_uri=https://opendata.meteo.be/service/alaro/ows',
            name: '10_m_v__wind_component',
            tiled: false,
            attribution: 'Royal Meteorological Institute of Belgium'
        },
        //"https://image.discomap.eea.europa.eu/arcgis/services/Elevation/EUElev_DEM_V11/MapServer/WMSServer#DEM_v11_Masked2"
    ],

    // Default extent
    extent: [3, 48, 6, 53],

    // Initialize the model
    init: (images, size) => {

        // read both the U and V rasters into separate pixel lattices
        const windU = new lib.model.ImageDataLattice(images[0]);
        const windV = new lib.model.ImageDataLattice(images[1]);

        // return [stateLattice, baseLattice]
        return [
            // the state is a 2D lattice of 1-dim cells, each containing an amount of virtual 'particles'
            // that will help track the wind
            new lib.model.BaseLattice2D(
                size[0], size[1],
                (x, y) => ([Math.random() > .99 ? 2 : 0]) // add random seeds
            ),
            // the base is a 2D lattice of 4-dim cells, containing the [x,y,amplitude,angle] wind vector
            // these redundant values are precomputed in the base lattice for performance sake
            new lib.model.BaseLattice2D(
                size[0], size[1],
                (x, y) => {
                    // each vector component is mapped from the luminance value of its respective raster
                    // luminance belongs to [0,1], and must be mapped to a [-1,1] range
                    var x = 2 * (lib.utils.rgbToHsl(windU.get(x, y))[2] - 0.5); //east-west vector
                    var y = 2 * (lib.utils.rgbToHsl(windV.get(x, y))[2] - 0.5); //north-south vector
                    x = x == -1 ? 0 : x; // minimal value actually means 0
                    y = y == -1 ? 0 : y;

                    var amplitude = Math.sqrt(Math.pow(x,2) + Math.pow(y,2));
                    var angle_degrees = Math.atan2(y/amplitude, x/amplitude);
                    return [x, y, amplitude, angle_degrees];
                }
            )
        ]
    },

    // step function is defined on a per-cell basis, using stepCellFn
    // this function is called for each cell separately, and must generate a new cell state
    stepCellFn: (
        stateCell, baseCell, x, y, state, base) => {

        // init the new state as a copy of the current one
        const newStateCell = [stateCell[0]];

        // iterate over the cell neighbourhood at a distance of 1 (i.e. 8 neighbours)
        lib.model.iterateNeighbourhood(
            state, base, x, y, 1,
            (dx, dy, neighbourStateAndBase) => {
                if (dx == 0 && dy == 0) {
                    // this is the cell itself
                    // remove the amount of particles leaving the cell
                    const delta = (Math.abs(baseCell[0]) + Math.abs(baseCell[1])) / 2 * stateCell[0];
                    newStateCell[0] -= delta;
                } else if (dx == 0) {
                    // vertical drift
                    if (neighbourStateAndBase[1][1] * dy > 0) {
                        const delta = Math.abs(neighbourStateAndBase[1][1]) * neighbourStateAndBase[0][0] / 2;
                        newStateCell[0] += delta;
                    }
                } else if (dy == 0) {
                    // horizontal drift
                    if (neighbourStateAndBase[1][0] * dx < 0) {
                        const delta = Math.abs(neighbourStateAndBase[1][0]) * neighbourStateAndBase[0][0] / 2;
                        newStateCell[0] += delta;
                    }
                }
            });

        return newStateCell;
    },

    // render the CA model state into a canvas image
    renderFn: (state, base) =>
        // use the fromLattice function that converts lattice to canvas
        // on a per-cell basis
        lib.model.ImageDataLattice.fromLattice(
            state,
            // set each to blue with transparency computed with level2alpha
            (x, y, cell) =>
                [0, 0, 0, Math.min(cell[0], 1) * 255]
        ).getData(),

    renderFn_old: (state, base) =>
        // use the fromLattice function that converts lattice to canvas
        // on a per-cell basis
        lib.model.ImageDataLattice.fromLattice(
            base,
            // set each to blue with transparency computed with level2alpha
            (x, y, cell) =>
                [cell[1] > 0 ? cell[1] * 255 : 0,
                    Math.abs(cell[0]) * 255,
                    cell[1] < 0 ? -cell[1] * 255 : 0,

                    Math.sqrt(cell[0] * cell[0] + cell[1] * cell[1]) * 255]
        ).getData()
}

return projectDescriptor;