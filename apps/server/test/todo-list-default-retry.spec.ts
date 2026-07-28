import { TodoListsService } from '../src/modules/todo-lists/todo-lists.service';

const defaultList = {
  id: 'list-1',
  userId: 'user-1',
  name: 'Inbox',
  color: null,
  isDefault: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function defaultConflict() {
  return {
    code: 'P2002',
    meta: { target: 'todo_lists_one_live_default_per_user_idx' },
  };
}

describe('default todo-list conflict handling', () => {
  it('retries a transient default-list P2002 once', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(defaultConflict())
      .mockResolvedValueOnce(defaultList);
    const service = new TodoListsService({ $transaction: transaction } as never);

    await expect(
      service.createTodoList(
        { id: 'user-1' } as never,
        { name: 'Inbox', is_default: true },
      ),
    ).resolves.toMatchObject({ data: defaultList });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('maps a persistent default-list P2002 to a specific conflict response', async () => {
    const transaction = jest.fn().mockRejectedValue(defaultConflict());
    const service = new TodoListsService({ $transaction: transaction } as never);

    await expect(
      service.createTodoList(
        { id: 'user-1' } as never,
        { name: 'Inbox', is_default: true },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'DEFAULT_TODO_LIST_CONFLICT' },
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
