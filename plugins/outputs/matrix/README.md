## Matrix Output

### Install
```
npm install -g @pastash/pastash @pastash/output_matrix
```

### Example

```
input {
  stdout {}
}

output {
  hyperbeam {
    userId => '@somebot:matrix.org'
    roomId => '#somechannel:matrix.org'
    token => 'xxxxxXXXXXxxxxxxXXXXXX'
  }
}
```