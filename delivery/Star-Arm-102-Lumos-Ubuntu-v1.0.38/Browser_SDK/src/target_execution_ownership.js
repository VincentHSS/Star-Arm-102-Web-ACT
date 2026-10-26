export class TargetExecutionOwnership {
  constructor() {
    this.owner = null;
  }

  get locked() {
    return this.owner !== null;
  }

  acquire(owner) {
    if (!owner || typeof owner !== 'object') throw new TypeError('确认执行所有权必须绑定目标对象');
    if (this.owner) throw new Error('目标命令正在确认或发送，不能重复执行');
    this.owner = owner;
    return owner;
  }

  assertOwner(owner) {
    if (!this.owner || this.owner !== owner) throw new Error('确认执行所有权已失效');
  }

  release(owner) {
    this.assertOwner(owner);
    this.owner = null;
  }
}
