## NTFY.SH Input
This plugins subscribes to an SSE EventSource stream such as those generated by ntfy.sh
Documentation: https://ntfy.sh/docs/subscribe/api

### Install
```
npm install -g @pastash/pastash @pastash/input_ntfy
```

### Example

```
input {
  ntfy {
    url => 'https://ntfy.sh/mytopic/sse'
  }
}

output {
  stdout {}
}
```