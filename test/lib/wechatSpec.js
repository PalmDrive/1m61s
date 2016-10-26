'use strict';

const chai = require('chai'),
      should = chai.should(),
      Wechat = require('../../controllers/wechat'),
      leanCloud = require('../../lib/lean_cloud'),
      uuid = require('node-uuid'),
      Transcript = leanCloud.AV.Object.extend('Transcript'),
      UserTranscript = leanCloud.AV.Object.extend('UserTranscript'),
      Task = leanCloud.AV.Object.extend('CrowdsourcingTask');

describe('TASK', function() {
  this.timeout(15000);

  const newUserId = 'test-user-new',
        oldUserId = 'test-user-old',
        t4UserId = 'test-user-t4',
        inProcessUser = 'test-user-in-process',
        completedOrder = 0,
        t4Order = [4, 5, 6, 7],
        inProcessOrder = 12,
        findTaskForUser = Wechat.findTaskForUser,
        findInProcessTaskForUser = Wechat.findInProcessTaskForUser;


  // create n transcripts with mediaId
  const createTranscriptsForMedia = (mediaId, n) => {
    const transcripts = [];
    let transcript;

    for (let i = 0; i < n; i++) {
      transcript = new Transcript();
      transcript.set('fragment_order', i);
      transcript.set('content', `transcript content ${i}`);
      transcript.set('media_id', mediaId);
      transcripts.push(transcript);
    }

    return leanCloud.AV.Object.saveAll(transcripts);
  };

  const createTasksForTranscripts = (transcripts) => {
    const tasks = transcripts.map(t => {
      const task = new Task(),
            fragmentOrder = t.get('fragment_order');
      ['fragment_order', 'media_id'].forEach(field => {
        task.set(field, t.get(field));
      })
      task.set('fragment_id', t.id);
      task.set('status', 0);
      task.set('fragment_type', 'Transcript');
      task.set('is_head', fragmentOrder % 4 === 0);

      if (fragmentOrder === completedOrder) {
        // Assign the first task to oldUser
        task.set('user_id', oldUserId);
        task.set('status', 1);
      } else if (t4Order.indexOf(fragmentOrder) !== -1) {
        // Assign a batch of tasks to t4User
        task.set('user_id', t4UserId);
        task.set('status', 1);
      } else if (fragmentOrder === inProcessOrder) {
        // Assign task 12 to inProcessUser
        task.set('user_id', inProcessUser);
        task.set('status', 0);
      }
      return task;
    });
    return leanCloud.AV.Object.saveAll(tasks);
  };

  const queryTableFromTask = () => {
    var query = new leanCloud.AV.Query('CrowdsourcingTask');
    query.find().then(task => {

    });
  };

  const deleteAll = (clss) => {
    const query = new leanCloud.AV.Query(clss);
    query.limit(1000); // Assume there are no more than 1000 rows in the class
    return query.find()
      .then(objs => leanCloud.AV.Object.destroyAll(objs));
  };

  beforeEach(done => {
    Promise.all([
      deleteAll('Transcript'),
      deleteAll('UserTranscript'),
      deleteAll('CrowdsourcingTask')
    ])
      .then(() => {
        const mediaId = uuid.v4();
        return createTranscriptsForMedia(mediaId, 20);
      })
      .then(transcripts => createTasksForTranscripts(transcripts))
      .then(() => done(), err => {
        console.log(err);
        done();
      });
  });

  describe('findTaskForUser', () => {
    it('should return a new task for a first-time user', done => {
      findTaskForUser(newUserId)
        .then(task => {
          const status = task.get('status'),
                isHead = task.get('is_head'),
                userId = task.get('user_id');

          status.should.equal(0);
          isHead.should.be.true;
          should.not.exist(userId);
          done();
        });
    });

    it('should return the next task when the user has completed tasks', done => {
      findTaskForUser(oldUserId)
        .then(task => {
          const status = task.get('status'),
                isHead = task.get('is_head'),
                userId = task.get('user_id'),
                fragmentOrder = task.get('fragment_order');

          status.should.equal(0);
          isHead.should.be.false;
          should.not.exist(userId);
          fragmentOrder.should.equal(completedOrder + 1);
          done();
        });
    });

    it('should return T1 when user just completed T4', done => {
      findTaskForUser(t4UserId)
        .then(task => {
          const status = task.get('status'),
                isHead = task.get('is_head'),
                userId = task.get('user_id'),
                fragmentOrder = task.get('fragment_order');

          status.should.equal(0);
          isHead.should.be.true;
          should.not.exist(userId);
          fragmentOrder.should.equal(t4Order[3] + 1);
          done();
        });
    });
  });

  describe('findInProcessTaskForUser', () => {
    it('should return the in process task for inProcessUser', done => {
      findInProcessTaskForUser(inProcessUser).then(task => {
        const fragmentOrder = task.get('fragment_order');
        fragmentOrder.should.equal(inProcessOrder);
        done();
      });
    });

    it('should return null for non inProcessUser', done => {
      findInProcessTaskForUser(newUserId).then(task => {
        should.not.exist(task);
        done();
      });
    });    
  });
});