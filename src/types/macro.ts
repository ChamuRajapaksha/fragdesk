export interface Macro {

    id:number;

    name:string;

    created:number;

    updated:number;

    hotkey:string | null;

    events:MacroEvent[];

}

export interface MacroEvent{

    order:number;

    delay:number;

    type:EventType;

    key?:string;

    button?:string;

    x?:number;

    y?:number;

}

export type EventType =

    | "keydown"

    | "keyup"

    | "mousedown"

    | "mouseup"

    | "mousemove"

    | "scroll"

    | "delay";