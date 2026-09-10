Component({
  properties: { item: { type: Object, value: {} }, busy: Boolean },
  methods: {
    onTap() { this.triggerEvent('tap', { item: this.data.item }) },
    onLike() { if (!this.data.busy) this.triggerEvent('like', { item: this.data.item }) },
    onPass() { if (!this.data.busy) this.triggerEvent('pass', { item: this.data.item }) },
    onSafety() { const item = this.data.item; this.triggerEvent('safety', { id: item.userId || item.targetUserId, photo: (item.photos || [])[0], photoIndex: 0 }) },
    onBuddy() { this.triggerEvent('buddy', { id: this.data.item.recentBuddy.postId }) }
  }
})
