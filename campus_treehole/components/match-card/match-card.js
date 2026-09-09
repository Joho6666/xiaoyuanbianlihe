Component({properties:{item:{type:Object,value:{}}},methods:{onChat(){this.triggerEvent('chat',{item:this.data.item})}}})
