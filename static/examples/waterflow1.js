
const automata = new lib.waterflow.WaterflowAutomata2();
const level2alpha = (level) => 1 - 1 / Math.pow(1 + level/5 , 2);

return {
    layers: ['https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer#0'],
    extent: [5,50,6,51], // lon/lat extent

    stepFn: (state, base) => automata.step(state, base),
        init: (images, size) => [
    new lib.model.BaseLattice2D(size[0], size[1],  (x, y) => ([0, Math.random()>.5 ? 0.4 : 0, [0,0]]) ),
            lib.spatial.TerrainLattice.createFromImages(images[0])
],
    renderFn: (state, base) => lib.model.ImageDataLattice.fromLattice(state, (x, y, cell) => [0,0,255, level2alpha(cell[1])*255]).getData()
}