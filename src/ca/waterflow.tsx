import { CellByCellAutomata, Lattice2D, Automata, BaseLattice2D, ImageDataLattice } from "./model";
import {
    TerrainCellStatus,
    TerrainLattice,
    SpatialEnvironment,
    TerrainCell,
    AutomataDescriptor
} from "./spatial";
import { Extent } from "ol/extent";
import * as React from "react";
import {MatrixDisplay} from "../index";

/**
 * CA that uses preprocessed diffusion matrix
 */
export class WaterflowAutomata1 extends CellByCellAutomata<Lattice2D<TerrainCellStatus>, TerrainLattice> {

    processCell(x: number, y:number, stateLattice: Lattice2D<TerrainCellStatus>, baseLattice: TerrainLattice) {
        // let's compute the deltas that will be added to the current cell
        let water_inner_delta = 0, water_outer_delta = 0;

        const thisTerrainCell = baseLattice.get(x,y);
        const thisTerrainStateCell = stateLattice.get(x,y);

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < stateLattice.getWidth() && y+dy < stateLattice.getHeight()) {
                    if (dx == 0 && dy == 0) continue;

                    const fromState = stateLattice.get(x+dx, y+dy);
                    const fromBase = baseLattice.get(x+dx, y+dy);

                    // heightDiff > 0 means this cell has absolute higher water level than neighbour
                    const heightDiff = thisTerrainCell.altitude == fromBase.altitude ? 
                        0 : 
                        thisTerrainCell.altitude + thisTerrainStateCell[1] - fromBase.altitude - fromState[1];

                    if (thisTerrainCell.diffusionMatrix[dy+1][dx+1] < 0) {
                        // water leaving this cell
                        water_outer_delta += heightDiff >= -5 ? thisTerrainCell.diffusionMatrix[dy+1][dx+1] * thisTerrainStateCell[1] : -heightDiff / 16;
                    } else if (thisTerrainCell.diffusionMatrix[dy+1][dx+1] > 0) {
                        // water entering this cell --> take water level of emitting cell
                        water_outer_delta += heightDiff <= 5 ? thisTerrainCell.diffusionMatrix[dy+1][dx+1] * fromState[1] : -heightDiff / 16;
                    } else {

                    }
                }
            }
        }

        return [
            thisTerrainStateCell[0] + water_inner_delta,
            thisTerrainStateCell[1] + water_outer_delta,
            thisTerrainStateCell[2],
            thisTerrainStateCell[3]] as TerrainCellStatus;
    }
}

/**
 * CA that does on the fly water diffusion computation
 */
export class WaterflowAutomata2 implements Automata<Lattice2D<TerrainCellStatus>, Lattice2D<TerrainCell>> {
    step(currentState: Lattice2D<TerrainCellStatus>, baseLattice: Lattice2D<TerrainCell>) {
        const newState = currentState.newInstance();
        currentState.forEach( (cell, x, y) => {
            this.processCell(x, y, currentState, newState, baseLattice);
        } );

        return newState;
    };

    processCell(x: number, y:number, currentState: Lattice2D<TerrainCellStatus>, newState: Lattice2D<TerrainCellStatus>, baseLattice: Lattice2D<TerrainCell>) {

        const thisTerrainCell = baseLattice.get(x,y);
        const thisTerrainStateCell = currentState.get(x,y);
        const currentWaterLevel = thisTerrainStateCell[1];

        let thisCellNewState = newState.get(x,y);
        if (!thisCellNewState) newState.set(x,y,thisCellNewState = [...thisTerrainStateCell] as TerrainCellStatus);

        //  under a certain threshold, let's ignore water
        if (currentWaterLevel <= 0.001) { // shouldn't be negative
            thisCellNewState[1] = 0;
            return;
        }

        // cumulativeVolume must be the sum of all transferVolumes
        let cumulativeVolume = 0;
        const transferVolumes = thisCellNewState[3] ? thisCellNewState[3] : thisCellNewState[3] = [[0,0,0], [0, 0, 0], [0, 0, 0]];
        transferVolumes[1][1] = currentWaterLevel;

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < currentState.getWidth() && y+dy < currentState.getHeight()) {
                    if (dx == 0 && dy == 0) continue;

                    const targetCurrentState = currentState.get(x+dx, y+dy);
                    let targetNewState = newState.get(x+dx, y+dy);
                    if (!targetNewState) newState.set(x+dx, y+dy, targetNewState = [...targetCurrentState] as TerrainCellStatus);

                    const toState = currentState.get(x+dx, y+dy);
                    const toBase = baseLattice.get(x+dx, y+dy);

                    // heightDiff > 0 means this cell has absolute higher water level than neighbour
                    const heightDiff = thisTerrainCell.altitude + currentWaterLevel // this cell total height
                                       - (toBase.altitude + toState[1])             // neighbour cell total height
                                       //+  (thisTerrainStateCell[3] ? thisTerrainStateCell[3][dy+1][dx+1] : 0)       // inertia factor : add the previous volume in the same direction

                    if (heightDiff > 0) {
                        // volumeTransfer must be <= currentWaterLevel
                        let volumeTransfer = Math.min(currentWaterLevel, heightDiff / 2);

                        if (dx == dy) volumeTransfer = volumeTransfer / 1.41; // diagonal moves should be adjusted to have uniform volume per meter
                        transferVolumes[dy+1][dx+1] = volumeTransfer;
                        cumulativeVolume += volumeTransfer;

                        const remaining = currentWaterLevel - volumeTransfer;
                        if (remaining > 0 && remaining<transferVolumes[1][1]) {
                            transferVolumes[1][1] = remaining;
                        }
                    } else if (transferVolumes[dy+1][dx+1] > 0)
                        // there's a remaining transferredVolume fro previous iteration --> remove it
                        // do not touch negative volumes, as they may have been set by a neighbour cell already
                        transferVolumes[dy+1][dx+1] = 0;
                }
            }
        }
        cumulativeVolume += transferVolumes[1][1];
        const dampingFactor =  0.95 //cumulativeVolume == 0 ? 1 : ( 1 - 0.02 * Math.pow( (cumulativeVolume - transferVolumes[1][1])/ cumulativeVolume, 4)); // (1 - 0.02 x^4) to damp high volume transfers;
        transferVolumes[1][1] -= cumulativeVolume; // this is obsolete

        let totalOutboundVolume = 0;

        let direction = [0,0] as [number, number];
        const transferVolumeFactor = cumulativeVolume && currentWaterLevel / cumulativeVolume ;
        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (dx == 0 && dy == 0) continue;

                const transferredVolume = transferVolumes[dy+1][dx+1];

                if (transferredVolume > 0) {
                    let targetNewState = newState.get(x+dx, y+dy);

                    const actualTransferredVolume = transferredVolume * transferVolumeFactor * dampingFactor;
                    totalOutboundVolume += actualTransferredVolume;

                    targetNewState[1] +=  actualTransferredVolume;
                    targetNewState[3] && (targetNewState[3][-dy+1][-dx+1] = -actualTransferredVolume);
                    transferVolumes[dy+1][dx+1] = actualTransferredVolume;

                    direction[0] += dx * transferredVolume;
                    direction[1] += dy * transferredVolume;
                }

            }
        }

        thisCellNewState[1] -= totalOutboundVolume;
        if (thisCellNewState[1] < 0)
            console.warn("WARN negative level :"+thisCellNewState[1])

        thisCellNewState[2] = direction;
        thisCellNewState[3] = transferVolumes;
    }
}

export class TerrainEnvironment extends SpatialEnvironment<Lattice2D<TerrainCellStatus>, TerrainLattice> {

    constructor(images: ImageData[], extent: Extent) {

        const level2alpha = (level: number) => 1 - 1 / Math.pow(1 + level/5 , 2);
        const demImage = images[0];
        super(
            new BaseLattice2D<TerrainCellStatus>(demImage.width, demImage.height, (x, y) => ([0, Math.random()>.5 ? 0.4 : 0, [0,0]])),
            TerrainLattice.createFromImages(demImage),
            new WaterflowAutomata2(),
            extent,
            (state, base) => {
                return ImageDataLattice.fromLattice(state, (x, y, cell) => [0,0,255,level2alpha(cell[1])*255]).getData();
            }
        );

        console.log(`Terrain initialized with [${this.getBase().getHeight()},${this.getBase().getWidth()}] cells`);
    }
}

/*
export function renderTerrainHtml(baseCell: TerrainCell) {
    return <><table>
        <tr><td>Alt</td><td>{baseCell.altitude}</td></tr>
        <tr><td>Water</td><td>{stateCell[1]}</td></tr>
        <tr><td>Dir</td><td>{stateCell[2].join(',')}</td></tr>
    </table>
        <MatrixDisplay matrix={stateCell[3]}/>
    </>
}
 */

export function renderHtml(stateCell: TerrainCellStatus, baseCell: TerrainCell) {
    return <><table>
        <tr><td>Alt</td><td>{baseCell.altitude}</td></tr>
        <tr><td>Water</td><td>{stateCell[1]}</td></tr>
        <tr><td>Dir</td><td>{stateCell[2].join(',')}</td></tr>
    </table>
        <MatrixDisplay matrix={stateCell[3]}/>
    </>
}

const automata = new WaterflowAutomata2();
const level2alpha = (level: number) => 1 - 1 / Math.pow(1 + level/5 , 2);

export const descriptor: AutomataDescriptor<TerrainCellStatus, TerrainCell> = {
    stepFn: (state, base) => automata.step(state, base),
    init: (images, size) => [
        new BaseLattice2D(size[0], size[1],  (x, y) => ([0, Math.random()>.5 ? 0.4 : 0, [0,0]]) ),
        TerrainLattice.createFromImages(images[0])
    ],
    renderFn: (state, base) => ImageDataLattice.fromLattice(state, (x, y, cell) => [0,0,255,level2alpha(cell[1])*255]).getData(),

    renderHtml
}