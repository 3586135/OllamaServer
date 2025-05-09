package io.kindbrave.ollamaserver.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import io.kindbrave.ollamaserver.MainActivity
import io.kindbrave.ollamaserver.R
import io.kindbrave.ollamaserver.utils.OllamaExecutor

class OllamaService : Service() {
    private lateinit var ollamaExecutor: OllamaExecutor
    private var process: Process? = null
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ollamaExecutor = OllamaExecutor(this)
        ollamaExecutor.setupEnvironment()
        process = ollamaExecutor.startOllamaService()

        startForegroundService()
        return START_STICKY
    }

    private fun startForegroundService() {
        val channelId = "OllamaServiceChannel"
        createNotificationChannel(channelId)

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_msg))
            .setAutoCancel(false)
            .setSmallIcon(R.drawable.ollama)
            .build()

        startForeground(1, notification) // 启动前台服务
    }

    private fun createNotificationChannel(channelId: String) {
        val channel = NotificationChannel(
            channelId,
            getString(R.string.notification_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        ollamaExecutor.stopOllamaService(process)
        super.onDestroy()
    }
}