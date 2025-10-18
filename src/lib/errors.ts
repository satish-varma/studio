
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

// A custom error class to hold more context about Firestore permission errors.
export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    // Construct a detailed error message.
    const message = `Firestore Permission Denied on path: ${context.path}, operation: ${context.operation}.`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    // This is to make the error object serializable for Next.js error overlay
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
