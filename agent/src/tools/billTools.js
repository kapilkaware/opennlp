const { v4: uuidv4 } = require('uuid');
const { readBills, writeBills } = require('../storage');

const tools = [
  {
    name: 'list_bills',
    description: 'List all bills, optionally filtered by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'paid'],
          description: 'Filter bills by status. If omitted, returns all bills.'
        }
      },
      required: []
    }
  },
  {
    name: 'add_bill',
    description: 'Add a new bill to track.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name or description of the bill'
        },
        amount: {
          type: 'number',
          description: 'Amount due in dollars'
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format'
        },
        category: {
          type: 'string',
          description: 'Category such as utilities, rent, insurance, etc.'
        }
      },
      required: ['name', 'amount', 'due_date']
    }
  },
  {
    name: 'mark_bill_paid',
    description: 'Mark a bill as paid by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the bill to mark as paid'
        }
      },
      required: ['id']
    }
  }
];

async function listBills({ status } = {}) {
  const bills = readBills();
  if (status) {
    return bills.filter((b) => b.status === status);
  }
  return bills;
}

async function addBill({ name, amount, due_date, category }) {
  const bills = readBills();
  const bill = {
    id: uuidv4(),
    name,
    amount,
    due_date,
    status: 'pending',
    category: category || 'general'
  };
  bills.push(bill);
  writeBills(bills);
  return bill;
}

async function markBillPaid({ id }) {
  const bills = readBills();
  const idx = bills.findIndex((b) => b.id === id);
  if (idx === -1) {
    return { error: `Bill with id ${id} not found` };
  }
  bills[idx].status = 'paid';
  writeBills(bills);
  return bills[idx];
}

const handlers = {
  list_bills: listBills,
  add_bill: addBill,
  mark_bill_paid: markBillPaid
};

module.exports = { tools, handlers };
