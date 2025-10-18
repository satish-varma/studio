
import { EventEmitter } from 'events';

// This is a simple event emitter that can be used to broadcast errors
// from anywhere in the application.
// A listener component will then catch these and display them.
export const errorEmitter = new EventEmitter();
