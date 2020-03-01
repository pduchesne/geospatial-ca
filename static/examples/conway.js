

/** @type lib.spatial.ProjectDescriptor */
const projectDescriptor = {
    description: 'Geospatial take on the classical Conway\'s Game of Life' ,
    data_layers: ['https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer#0'],
    extent: [5,50,6,51], // lon/lat extent

    stepFn: (state, base) => automata.step(state, base),
    init: (images, size) => [
        new lib.model.BaseLattice2D(size[0], size[1],  (x, y) => ([0, Math.random()>.95 ? 0.4 : 0, [0,0]]) )
    ],
    renderFn: (state, base) => lib.model.ImageDataLattice.fromLattice(state, (x, y, cell) => [0,0,255, level2alpha(cell[1])*255]).getData()
}

return projectDescriptor;