// 'use strict';

// const _ = require('underscore'),
//       env = process.env.NODE_ENV,
//       Models = require('../../models');


// module.exports = {
//   waitAndReload(instance, fn, wait=500) {
//     if (typeof fn !== 'function') {
//       wait = fn || 500;
//       return new Promise((resolve, reject) => {
//         setTimeout(() => {
//           instance.reload()
//             .then(reloadedInstance => resolve(reloadedInstance));
//         }, wait);
//       });
//     } else {
//       setTimeout(() => {
//         instance.reload()
//           .then(reloadedInstance => fn(reloadedInstance));
//       }, wait);
//     }
//   },

//   truncateTables(models) {
//     return Promise.all(models.map(model => {
//       return model.destroy({truncate: true});
//     }));
//   }
// };
