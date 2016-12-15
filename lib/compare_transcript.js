'use strict';

const getTotalWords = sentence => {
  const enWord = /\b[a-z0-9]+\b/gim,
        cnWord = /[\u4e00-\u9fa5]/gim,
        enWords = sentence.match(enWord) || [],
        cnWords = sentence.match(cnWord) || '';
  return enWords.concat(cnWords);
};

//assume group2 is right
const diffWords = (sen1, sen2) => {
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

module.exports = {
  getTotalWords,
  diffWords
};