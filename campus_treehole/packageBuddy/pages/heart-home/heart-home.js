const app=getApp()
Page({
  data:{loading:true,busy:false,error:'',profile:null,tab:'discover',cards:[],page:1,hasMore:false,quota:{remaining:0,limit:1},fate:null,revealed:false,match:null},
  onShow(){this.refresh()},
  async api(action,data={}){const r=await app.callDB(action,data);if(r.code!==0)throw Error(r.msg||'加载失败');return r.data},
  async refresh(){
    const generation=this._generation=(this._generation||0)+1
    this.setData({loading:true,error:'',cards:[],fate:null,revealed:false,match:null})
    try{const profile=await this.api('getHeartProfile');if(generation!==this._generation)return;this.setData({profile,error:profile.needsReconfirm?profile.message:''});if(profile.enabled){const quota=await this.api('getFateCardQuota');if(generation===this._generation)this.setData({quota});await this.loadTab(generation)}}catch(e){if(generation===this._generation)this.setData({error:e.message})}finally{if(generation===this._generation)this.setData({loading:false})}
  },
  async loadTab(generation=this._generation){
    let patch={}
    if(this.data.tab==='fate')patch={quota:await this.api('getFateCardQuota')}
    else if(this.data.tab==='matches')patch={cards:await this.api('getHeartMatches'),hasMore:false}
    else{const r=await this.api('getHeartDiscover',{page:1});patch={cards:r.rows,page:1,hasMore:r.hasMore}}
    if(generation===this._generation)this.setData(patch)
  },
  switchTab(e){if(this.data.busy)return;this.setData({tab:e.currentTarget.dataset.tab});this.refresh()},
  edit(){wx.navigateTo({url:'../heart-profile-edit/heart-profile-edit'})},
  async more(){if(this.data.busy)return;const generation=this._generation;this.setData({busy:true});try{const r=await this.api('getHeartDiscover',{page:this.data.page+1});if(generation===this._generation)this.setData({cards:this.data.cards.concat(r.rows),page:this.data.page+1,hasMore:r.hasMore})}catch(e){this.setData({error:e.message})}finally{this.setData({busy:false})}},
  async draw(){if(this.data.busy)return;this.setData({busy:true,error:'',fate:null,revealed:false});try{const r=await this.api('drawFateCard');this.setData({fate:r.card||null,quota:{remaining:r.remaining,limit:r.limit},emptyFate:!!r.empty})}catch(e){this.setData({error:e.message})}finally{this.setData({busy:false})}},
  reveal(){this.setData({revealed:true})},
  async react(e){if(this.data.busy)return;const {id,action}=e.currentTarget.dataset;this.setData({busy:true,error:''});try{const r=await this.api(action==='like'?'likeHeartProfile':'passHeartProfile',{targetUserId:id});this.setData({cards:this.data.cards.filter(x=>x.userId!==id),fate:null});if(r.status==='MATCHED')this.setData({match:r});else wx.showToast({title:action==='like'?'已表达感兴趣':'已略过',icon:'none'})}catch(e){this.setData({error:e.message})}finally{this.setData({busy:false})}},
  onHeartLike(e){const item=e&&e.detail&&e.detail.item;if(item)this.react({currentTarget:{dataset:{id:item.userId || item.targetUserId,action:'like'}}})},
  onHeartPass(e){const item=e&&e.detail&&e.detail.item;if(item)this.react({currentTarget:{dataset:{id:item.userId || item.targetUserId,action:'pass'}}})},
  onMatchChat(e){const item=e&&e.detail&&e.detail.item;if(item)this.chat({currentTarget:{dataset:{id:item.userId}}})},
  onDiscoverTab(){this.switchTab({currentTarget:{dataset:{tab:'discover'}}})},
  async chat(e){try{const targetUserId=e.currentTarget.dataset.id||this.data.match.targetUserId;await this.api('startHeartChat',{targetUserId});wx.navigateTo({url:'/pages/chat/chat?targetUserId='+encodeURIComponent(targetUserId)})}catch(e){this.setData({error:e.message})}},
  buddies(){const interests=this.data.match&&this.data.match.sharedInterests||[];const category=interests.some(x=>/羽毛球|篮球|运动/.test(x))?'sport':interests.some(x=>/摄影|拍照/.test(x))?'photo':'all';wx.redirectTo({url:'../buddy-square/buddy-square?category='+category})},
  onCardSafety(e) { return this.safety({ currentTarget: { dataset: e.detail } }) },
  onCardBuddy(e) { return this.viewBuddy({ currentTarget: { dataset: e.detail } }) },
  viewBuddy(e){wx.navigateTo({url:'../buddy-detail/buddy-detail?id='+encodeURIComponent(e.currentTarget.dataset.id)})},
  async safety(e){const {id,photo,photoIndex}=e.currentTarget.dataset;wx.showActionSheet({itemList:['举报资料','举报照片','拉黑'],success:async r=>{try{if(r.tapIndex===2){await this.api('toggleUserBlock',{targetUserId:id});this.refresh()}else{wx.showModal({title:'举报',editable:true,placeholderText:'请说明原因（最多200字）',success:async m=>{if(!m.confirm)return;try{const payload={targetType:r.tapIndex===0?'heart_profile':'heart_photo',targetId:id,reason:m.content};if(r.tapIndex===1){payload.photoFileId=photo;payload.photoIndex=Number(photoIndex)}await this.api('reportContent',payload);wx.showToast({title:'已提交'})}catch(err){this.setData({error:err.message})}}})}}catch(err){this.setData({error:err.message})}}})},
  disable(){wx.showModal({title:'退出心动模式',content:'退出后立即停止新的推荐曝光。',success:async r=>{if(r.confirm){try{await this.api('disableHeartProfile');this.refresh()}catch(e){this.setData({error:e.message})}}}})}
})
