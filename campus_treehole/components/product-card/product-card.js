Component({properties:{item:{type:Object,value:{}}},methods:{onTap(){this.triggerEvent('tap',{item:this.data.item})},onFavorite(){this.triggerEvent('favorite',{item:this.data.item})}}})
