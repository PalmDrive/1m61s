'use strict';

const _ = require('underscore');

const getTotalWords = sentence => {
  const enWord = /\b[a-z0-9]+\b/gim,
    cnWord = /[\u4e00-\u9fa5]/gim,
    is_all_en = _.every(sentence, res=> {
      return /[a-z 0-9]/gim.test(res);
    });

  if (is_all_en) {
    const enWords = sentence.match(enWord) || [];
    return enWords;
  } else {
    const enWords = sentence.match(enWord) || [],
      cnWords = sentence.match(cnWord) || '';
    return enWords.concat(cnWords);
  }
};

//assume group2 is right
const diffWordsWithoutXX = (sen1, sen2) => {
  let result = 0;

  const sortFunc = d => {
    return String(d).toLowerCase();
  };

  const countDiff = (d, obj) => {
    let count = 0;

    for (let k_i in d) {
      count += obj[d[k_i]];
    }
    return count;
  };

  const countNum = (group)=>{
    let count = 0;
    for(let key in group){
      count += group[key];
    }
    return count;
  };

  const countSame = (d, obj1, obj2) => {
    let count = 0;

    for (let k_i in d) {
      count += Math.abs(obj1[d[k_i]] - obj2[d[k_i]]);
    }
    return count;
  };

  const wordGroup1 = _.groupBy(sen1, sortFunc),
        wordGroup2 = _.groupBy(sen2, sortFunc),
        countGroup1 = {},
        countGroup2 = {};

  for (let key in wordGroup1) {
    countGroup1[key] = wordGroup1[key].length;
  }

  for (let key in wordGroup2) {
    countGroup2[key] = wordGroup2[key].length;
  }

  //calc diff keys
  let diff_keys =[],
      bigger = countGroup2;
  if (countNum(countGroup2) >= countNum(countGroup1)) {
    diff_keys = _.difference(Object.keys(countGroup2), Object.keys(countGroup1));
  } else {
    bigger = countGroup1;
    diff_keys = _.difference(Object.keys(countGroup1), Object.keys(countGroup2));
  }

  console.log(diff_keys);
  console.log(bigger);
  console.log(countDiff(diff_keys, bigger));
  result += countDiff(diff_keys, bigger);
  console.log(result);

  //diff_keys = _.difference(Object.keys(countGroup1), Object.keys(countGroup2));
  //result += countDiff(diff_keys, countGroup1);

  //calc same keys but count diff
  const same_keys = _.intersection(Object.keys(countGroup1), Object.keys(countGroup2));
  result += countSame(same_keys, countGroup1, countGroup2);
  return result;
};

const diffWords = (sen1, sen2) => {
  let result = 0;
  let resultHightLight = [];

  sen1.map(words1 => {
    if(!_.some(sen2.map(words2 => {return words1 === words2;}))) {
      result ++;
      resultHightLight.push({title:words1, color:'1'});
    } else {
      resultHightLight.push({title:words1});
    }
  });

  const sortFunc = d => {
    return String(d).toLowerCase();
  };

  const wordGroup1 = _.groupBy(sen1, sortFunc),
        wordGroup2 = _.groupBy(sen2, sortFunc),
        countGroup1 = {},
        countGroup2 = {};

  for (let key in wordGroup2) {
    countGroup2[key] = wordGroup2[key].length;
  }

  for (let key in wordGroup1) {
    countGroup1[key] = wordGroup1[key].length;
    if (countGroup2[key]) {
      const differCount = wordGroup1[key].length - countGroup2[key];
      if (differCount > 0) {
        result += differCount;
        for (let i = resultHightLight.length - 1; i >= 0; i--) {
          const resultHL = resultHightLight[i];
          if (resultHL.title === key && resultHL.color !== '1') {
            resultHightLight.splice(i,1,{title:key, color:'1'});
          }
        }
      }
    }
  }
  return {diffCount: result, hightLightResult: resultHightLight};
};

const hightLightDiffWords = (sen1, sen2) => {
  let result = [];

  sen1.map(words1 => {
    if(!_.some(sen2.map(words2 => {return words1 === words2;} ))) {
      result.push({title:words1, color:'1'});
    } else {
      result.push({title:words1});
    }
  });
  return result;
};

module.exports = {
  getTotalWords,
  diffWords,
  diffWordsWithoutXX,
  hightLightDiffWords
};
