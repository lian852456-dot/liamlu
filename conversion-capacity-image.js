'use strict';
// Draw only the same aggregate briefing shown in the panel. Never capture the upload form.
window.capacityBriefingImage = function capacityBriefingImage(columns) {
  const width=columns.length===1?1080:1780, gutter=28, margin=36;
  const cardWidth=(width-margin*2-gutter*(columns.length-1))/columns.length;
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  const font=(size,bold)=> (bold?'700 ':'400 ')+size+'px "Microsoft JhengHei","Noto Sans CJK TC",sans-serif';
  function wrap(text,maxWidth){
    const result=[];let line='';
    for(const ch of text){
      if(line && ctx.measureText(line+ch).width>maxWidth){result.push(line);line='';}
      line+=ch;
    }
    if(line)result.push(line);
    return result;
  }
  // Measure the wrapped text before allocating the final bitmap.
  const commands=[];
  function line(x,y,text,size,color,bold=false){commands.push({x,y,text,size,color,bold});}
  let height=0;
  columns.forEach((col,i)=>{
    const x=margin+i*(cardWidth+gutter);
    let y=110;
    function paragraph(text,size,color,bold=false){
      ctx.font=font(size,bold);
      for(const part of wrap(text,cardWidth-32)){line(x+16,y,part,size,color,bold);y+=size+9;}
    }
    paragraph(col.title,28,'#123c51',true);
    for(const group of col.groups){
      y+=16;commands.push({x,y:y-23,w:cardWidth,h:38});line(x+14,y+4,group.title,23,'#123c51',true);y+=34;
      for(const [label,value] of group.lines){
        paragraph(label,18,'#9e4208',true);
        paragraph(value,20,'#172f3e');y+=6;
      }
    }
    height=Math.max(height,y+24);
  });
  canvas.width=width;canvas.height=height;
  ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#e66720';ctx.fillRect(0,0,width,9);
  ctx.font=font(35,true);ctx.fillStyle='#123c51';ctx.fillText('門市銷售提醒｜主打資費與帶量商品',margin,61);
  for(const c of commands){
    if(c.w){ctx.fillStyle='#edf4f6';ctx.fillRect(c.x,c.y,c.w,c.h);continue;}
    ctx.font=font(c.size,c.bold);ctx.fillStyle=c.color;ctx.fillText(c.text,c.x,c.y);
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('無法產生 PNG，請再試一次。')),'image/png'));
};
